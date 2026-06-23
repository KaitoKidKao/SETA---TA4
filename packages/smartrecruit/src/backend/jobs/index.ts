import { buildActorSession } from '@seta/identity';
import { and, eq, inArray } from 'drizzle-orm';
import type { TaskList } from 'graphile-worker';
import pino from 'pino';
import { smartrecruitDb } from '../db/client.ts';
import { campaignCandidates, candidates, outreachDrafts } from '../db/schema.ts';
import { recomputeCampaignCounters, updateCampaignStatus } from '../domain/campaign.ts';
import { draftOutreach } from '../domain/draft-outreach.ts';
import { executeOutreach } from '../domain/execute-outreach.ts';
import {
  scanHmFeedbackReminderDrafts,
  sendHmFeedbackReminderAttempt,
} from '../domain/hm-feedback.ts';
import { screenCv } from '../domain/screen-cv.ts';
import { isShortlistedScore } from '../domain/shortlist-policy.ts';
import { campaignJobs } from './campaign-jobs.ts';

const log = pino({ name: 'smartrecruit/jobs' });

export interface BatchScreenCvPayload {
  candidateIds: string[];
  criteriaId: string;
  userId: string;
}

export interface BatchDraftOutreachPayload {
  candidateIds: string[];
  templateId?: string;
  userId: string;
}

export interface CampaignJobPayload {
  campaignId: string;
  criteriaId?: string;
  templateId?: string;
  userId: string;
  approvedDraftIds?: string[];
}

export interface HmFeedbackReminderSendPayload {
  attemptId: string;
  userId: string;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export const smartrecruitJobs: TaskList = {
  'smartrecruit:hm_feedback_reminder_scan': async () => {
    const result = await scanHmFeedbackReminderDrafts();
    log.info({ prepared: result.prepared }, 'hm_feedback_reminder_scan.completed');
  },

  'smartrecruit:hm_feedback_reminder_send': async (payload: unknown) => {
    const { attemptId, userId } = payload as HmFeedbackReminderSendPayload;
    if (!attemptId || !userId) {
      throw new Error('hm_feedback_reminder_send requires attemptId and userId');
    }
    await sendHmFeedbackReminderAttempt({ attemptId, userId });
  },

  'smartrecruit:campaign_screen': async (payload: unknown, _helpers: unknown) => {
    const { campaignId, criteriaId, userId } = payload as CampaignJobPayload;
    if (!campaignId || !criteriaId || !userId) {
      throw new Error('campaign_screen requires campaignId, criteriaId and userId');
    }

    const session = await buildActorSession({ user_id: userId });
    const db = smartrecruitDb();
    await updateCampaignStatus({
      campaignId,
      tenantId: session.tenant_id,
      status: 'screening',
      criteriaId,
    });

    const rows = await db
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, campaignId),
        ),
      );

    for (const row of rows) {
      if (row.status !== 'queued' && row.status !== 'screening_failed') continue;
      const [candidate] = await db
        .select()
        .from(candidates)
        .where(
          and(eq(candidates.tenant_id, session.tenant_id), eq(candidates.id, row.candidate_id)),
        )
        .limit(1);
      if (!candidate) {
        await db
          .update(campaignCandidates)
          .set({
            status: 'screening_failed',
            error_reason: `Candidate ${row.candidate_id} not found`,
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await recomputeCampaignCounters({ campaignId, tenantId: session.tenant_id });
        continue;
      }

      try {
        await db
          .update(campaignCandidates)
          .set({ status: 'screening', started_at: new Date(), updated_at: new Date() })
          .where(eq(campaignCandidates.id, row.id));

        const screened = await screenCv({
          existingCandidateId: candidate.id,
          candidateName: candidate.display_name,
          candidateEmail: candidate.email,
          candidatePhone: candidate.phone ?? undefined,
          cvPath: candidate.cv_path ?? undefined,
          cvText: candidate.cv_text ?? '',
          criteriaId,
          session,
        });

        await db
          .update(campaignCandidates)
          .set({
            status: isShortlistedScore(screened.fitScore) ? 'shortlisted' : 'screened',
            fit_score: screened.fitScore,
            screening_report: screened.report,
            error_reason: null,
            screened_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
      } catch (err) {
        const message = errorMessage(err);
        await db
          .update(campaignCandidates)
          .set({
            status: 'screening_failed',
            fit_score: 0,
            error_reason: message,
            screened_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await db
          .update(candidates)
          .set({
            status: 'screened',
            fit_score: 0,
            screening_report: {
              pros: [],
              gaps: [`Screening failed: ${message}`],
              yoeExplanation: 'Unable to calculate years of experience because screening failed.',
              overallJustification:
                'The automated screening step failed for this CV. Keep this candidate for manual recruiter review.',
              mustHaveMatches: [],
              niceToHaveMatches: [],
              scoreBreakdown: { mustHaveSkills: 0, yoe: 0, english: 0, niceToHave: 0 },
              flags: ['SCREENING_FAILED'],
            },
            updated_at: new Date(),
          })
          .where(eq(candidates.id, row.candidate_id));
        log.error({ err, campaignId, candidateId: row.candidate_id }, 'Campaign screening failed.');
      }

      await recomputeCampaignCounters({ campaignId, tenantId: session.tenant_id });
    }

    await updateCampaignStatus({
      campaignId,
      tenantId: session.tenant_id,
      status: 'screening_completed',
      criteriaId,
    });
    await recomputeCampaignCounters({ campaignId, tenantId: session.tenant_id });
  },

  'smartrecruit:campaign_draft_outreach': async (payload: unknown, _helpers: unknown) => {
    const { campaignId, templateId, userId } = payload as CampaignJobPayload;
    if (!campaignId || !userId)
      throw new Error('campaign_draft_outreach requires campaignId and userId');

    const session = await buildActorSession({ user_id: userId });
    const db = smartrecruitDb();
    await updateCampaignStatus({ campaignId, tenantId: session.tenant_id, status: 'drafting' });

    const rows = await db
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, campaignId),
          inArray(campaignCandidates.status, ['shortlisted', 'drafting', 'screened']),
        ),
      );

    for (const row of rows) {
      if (row.draft_id) continue;
      try {
        await db
          .update(campaignCandidates)
          .set({ status: 'drafting', updated_at: new Date() })
          .where(eq(campaignCandidates.id, row.id));

        const [existingDraft] = await db
          .select()
          .from(outreachDrafts)
          .where(
            and(
              eq(outreachDrafts.tenant_id, session.tenant_id),
              eq(outreachDrafts.campaign_id, campaignId),
              eq(outreachDrafts.candidate_id, row.candidate_id),
            ),
          )
          .limit(1);

        const draft =
          existingDraft ??
          (await draftOutreach({
            candidateId: row.candidate_id,
            templateId,
            session,
          }));
        const draftId = 'candidateId' in draft ? draft.id : draft.id;

        await db
          .update(outreachDrafts)
          .set({ campaign_id: campaignId, updated_at: new Date() })
          .where(eq(outreachDrafts.id, draftId));
        await db
          .update(campaignCandidates)
          .set({
            status: 'drafted',
            draft_id: draftId,
            error_reason: null,
            drafted_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
      } catch (err) {
        await db
          .update(campaignCandidates)
          .set({
            status: 'draft_failed',
            error_reason: errorMessage(err),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        log.error({ err, campaignId, candidateId: row.candidate_id }, 'Campaign draft failed.');
      }
      await recomputeCampaignCounters({ campaignId, tenantId: session.tenant_id });
    }

    await updateCampaignStatus({
      campaignId,
      tenantId: session.tenant_id,
      status: 'awaiting_outreach_approval',
    });
    await recomputeCampaignCounters({ campaignId, tenantId: session.tenant_id });
  },

  'smartrecruit:campaign_send_outreach': async (payload: unknown, _helpers: unknown) => {
    const { campaignId, userId, approvedDraftIds } = payload as CampaignJobPayload;
    if (!campaignId || !userId)
      throw new Error('campaign_send_outreach requires campaignId and userId');

    const session = await buildActorSession({ user_id: userId });
    const db = smartrecruitDb();
    await updateCampaignStatus({ campaignId, tenantId: session.tenant_id, status: 'sending' });

    const rows = await db
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, campaignId),
        ),
      );
    const approved = new Set(approvedDraftIds ?? []);

    for (const row of rows) {
      if (!row.draft_id || (approved.size > 0 && !approved.has(row.draft_id))) continue;
      if (row.status === 'sent') continue;
      try {
        await db
          .update(campaignCandidates)
          .set({ status: 'sending', updated_at: new Date() })
          .where(eq(campaignCandidates.id, row.id));
        await executeOutreach({ draftId: row.draft_id, session });
        await db
          .update(campaignCandidates)
          .set({
            status: 'sent',
            error_reason: null,
            sent_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
      } catch (err) {
        await db
          .update(campaignCandidates)
          .set({
            status: 'send_failed',
            error_reason: errorMessage(err),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        if (row.draft_id) {
          await db
            .update(outreachDrafts)
            .set({ status: 'failed', error_reason: errorMessage(err), updated_at: new Date() })
            .where(eq(outreachDrafts.id, row.draft_id));
        }
        log.error({ err, campaignId, draftId: row.draft_id }, 'Campaign send failed.');
      }
      await recomputeCampaignCounters({ campaignId, tenantId: session.tenant_id });
    }

    await updateCampaignStatus({ campaignId, tenantId: session.tenant_id, status: 'completed' });
    await recomputeCampaignCounters({ campaignId, tenantId: session.tenant_id });
  },

  'smartrecruit:batch_screen_cv': async (payload: unknown, _helpers: unknown) => {
    const { candidateIds, criteriaId, userId } = payload as BatchScreenCvPayload;
    if (!candidateIds || candidateIds.length === 0) {
      log.info('No candidates provided for batch screening.');
      return;
    }

    log.info(
      { candidateCount: candidateIds.length, criteriaId },
      'Starting batch screening job...',
    );
    const session = await buildActorSession({ user_id: userId });
    const db = smartrecruitDb();

    const rows = await db
      .select()
      .from(candidates)
      .where(
        and(eq(candidates.tenant_id, session.tenant_id), inArray(candidates.id, candidateIds)),
      );

    for (const candidate of rows) {
      try {
        log.info({ candidateId: candidate.id }, `Screening candidate ${candidate.display_name}...`);
        await screenCv({
          existingCandidateId: candidate.id,
          candidateName: candidate.display_name,
          candidateEmail: candidate.email,
          candidatePhone: candidate.phone ?? undefined,
          cvPath: candidate.cv_path ?? undefined,
          cvText: candidate.cv_text ?? '',
          criteriaId,
          session,
        });
      } catch (err) {
        log.error(
          { err, candidateId: candidate.id },
          `Failed to screen candidate ${candidate.display_name}.`,
        );
      }
    }
    log.info('Batch screening job completed.');
  },

  'smartrecruit:batch_draft_outreach': async (payload: unknown, _helpers: unknown) => {
    const { candidateIds, templateId, userId } = payload as BatchDraftOutreachPayload;
    if (!candidateIds || candidateIds.length === 0) {
      log.info('No candidates provided for batch drafting outreach.');
      return;
    }

    log.info(
      { candidateCount: candidateIds.length, templateId },
      'Starting batch drafting outreach job...',
    );
    const session = await buildActorSession({ user_id: userId });

    for (const candidateId of candidateIds) {
      try {
        log.info({ candidateId }, 'Drafting outreach for candidate...');
        await draftOutreach({
          candidateId,
          templateId,
          session,
        });
      } catch (err) {
        log.error({ err, candidateId }, 'Failed to draft outreach for candidate.');
      }
    }
    log.info('Batch drafting outreach job completed.');
  },
  ...campaignJobs,
};
