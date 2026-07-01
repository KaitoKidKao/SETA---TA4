import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { buildActorSession } from '@seta/identity';
import type { NodeTx } from '@seta/shared-db';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { JobHelpers, TaskList } from 'graphile-worker';
import pino from 'pino';
import { smartrecruitDb } from '../db/client.ts';
import {
  campaignAiUsage,
  campaignCandidates,
  campaigns,
  candidates,
  outreachDrafts,
} from '../db/schema.ts';
import { updateCampaignStatus } from '../domain/campaign.ts';
import { draftOutreach } from '../domain/draft-outreach.ts';
import { executeOutreach } from '../domain/execute-outreach.ts';
import { SCREENING_PROMPT_VERSION } from '../domain/scoring.ts';
import { screenCv } from '../domain/screen-cv.ts';
import { isShortlistedScore } from '../domain/shortlist-policy.ts';

const log = pino({ name: 'smartrecruit/campaign-jobs' });

type Stage = 'screening' | 'drafting' | 'sending';

interface CoordinatorPayload {
  campaignId: string;
  criteriaId?: string;
  templateId?: string;
  userId: string;
  approvedDraftIds?: string[];
}

interface ItemPayload extends CoordinatorPayload {
  campaignCandidateId: string;
  candidateId: string;
  draftId?: string;
}

const TERMINAL = {
  screening: new Set(['screened', 'shortlisted', 'screening_failed']),
  drafting: new Set(['drafted', 'draft_failed']),
  sending: new Set(['sent', 'send_failed', 'rejected']),
} satisfies Record<Stage, Set<string>>;

function actor(session: SessionScope) {
  return { actor: { userId: session.user_id, tenantId: session.tenant_id } };
}

async function isCampaignCanceled(session: SessionScope, campaignId: string): Promise<boolean> {
  const [campaign] = await smartrecruitDb()
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenant_id, session.tenant_id)))
    .limit(1);
  return campaign?.status === 'canceled';
}

async function isCampaignCanceledTx(
  tx: NodeTx,
  session: SessionScope,
  campaignId: string,
): Promise<boolean> {
  const [campaign] = await tx
    .select({ status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenant_id, session.tenant_id)))
    .limit(1);
  return campaign?.status === 'canceled';
}

function errorInfo(err: unknown): { code: string; message: string; transient: boolean } {
  const value = err as { code?: unknown; status?: unknown; retryable?: unknown; message?: unknown };
  const message = err instanceof Error ? err.message : String(err);
  const code =
    typeof value?.code === 'string'
      ? value.code
      : typeof value?.status === 'number'
        ? `HTTP_${value.status}`
        : 'UNKNOWN';
  const transient =
    value?.retryable === true ||
    [408, 425, 429, 500, 502, 503, 504].includes(Number(value?.status)) ||
    /429|rate.?limit|timeout|timed out|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|SMTP\s*4\d\d/i.test(
      message,
    );
  return { code, message, transient };
}

function counts(statuses: string[]) {
  const screened = new Set([
    'screened',
    'shortlisted',
    'screening_failed',
    'drafting',
    'drafted',
    'draft_failed',
    'sending',
    'sent',
    'send_failed',
    'rejected',
  ]);
  const shortlisted = new Set([
    'shortlisted',
    'drafting',
    'drafted',
    'draft_failed',
    'sending',
    'sent',
    'send_failed',
    'rejected',
  ]);
  return {
    total_candidates: statuses.length,
    screened_count: statuses.filter((status) => screened.has(status)).length,
    shortlisted_count: statuses.filter((status) => shortlisted.has(status)).length,
    failed_count: statuses.filter((status) => status.endsWith('_failed')).length,
    drafted_count: statuses.filter((status) =>
      ['drafted', 'sending', 'sent', 'send_failed', 'rejected'].includes(status),
    ).length,
    sent_count: statuses.filter((status) => status === 'sent').length,
  };
}

async function advanceStage(
  tx: NodeTx,
  session: SessionScope,
  campaignId: string,
  stage: Stage,
): Promise<void> {
  await tx.execute(
    sql`SELECT id FROM smartrecruit.campaigns WHERE id = ${campaignId}::uuid AND tenant_id = ${session.tenant_id}::uuid FOR UPDATE`,
  );
  const [campaign] = await tx
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenant_id, session.tenant_id)))
    .limit(1);
  if (!campaign) return;

  const rows = await tx
    .select({ status: campaignCandidates.status })
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.tenant_id, session.tenant_id),
        eq(campaignCandidates.campaign_id, campaignId),
      ),
    );
  const statuses = rows.map((row) => row.status);
  const stageRelevant =
    stage === 'screening'
      ? statuses
      : stage === 'drafting'
        ? statuses.filter((status) =>
            ['shortlisted', 'drafting', 'drafted', 'draft_failed'].includes(status),
          )
        : statuses.filter((status) =>
            ['drafted', 'sending', 'sent', 'send_failed', 'rejected'].includes(status),
          );
  const remaining = stageRelevant.some((status) => !TERMINAL[stage].has(status));
  const counterValues = counts(statuses);
  if (remaining) {
    await tx
      .update(campaigns)
      .set({ ...counterValues, updated_at: new Date() })
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenant_id, session.tenant_id)));
    return;
  }

  const expectedStatus =
    stage === 'screening' ? 'screening' : stage === 'drafting' ? 'drafting' : 'sending';
  if (campaign.status !== expectedStatus) return;
  const hasFailures = statuses.some((status) => status.endsWith('_failed'));
  const nextStatus =
    stage === 'screening'
      ? 'screening_completed'
      : stage === 'drafting'
        ? 'awaiting_outreach_approval'
        : hasFailures
          ? 'completed_with_errors'
          : 'completed';
  const now = new Date();
  const [updated] = await tx
    .update(campaigns)
    .set({
      ...counterValues,
      status: nextStatus,
      ...(stage === 'screening' ? { screening_completed_at: now } : {}),
      ...(stage === 'drafting' ? { drafting_completed_at: now } : {}),
      ...(stage === 'sending' ? { sending_completed_at: now, completed_at: now } : {}),
      updated_at: now,
    })
    .where(
      and(
        eq(campaigns.id, campaignId),
        eq(campaigns.tenant_id, session.tenant_id),
        eq(campaigns.status, expectedStatus),
      ),
    )
    .returning({ workflowRunId: campaigns.workflow_run_id });
  if (!updated?.workflowRunId) return;

  await emit({
    tenantId: session.tenant_id,
    aggregateType: 'smartrecruit_campaign',
    aggregateId: campaignId,
    eventType: `smartrecruit.campaign.${stage}_completed`,
    eventVersion: 1,
    causedByUserId: session.user_id,
    payload: {
      campaignId,
      workflowRunId: updated.workflowRunId,
      stage,
      status: nextStatus,
    },
  });
}

async function advanceWithoutItem(
  session: SessionScope,
  campaignId: string,
  stage: Stage,
): Promise<void> {
  await withEmit(actor(session), async (tx) => advanceStage(tx, session, campaignId, stage));
}

function isFinalAttempt(helpers: JobHelpers): boolean {
  return helpers.job.attempts >= helpers.job.max_attempts;
}

async function recordAiUsage(args: {
  session: SessionScope;
  payload: ItemPayload;
  stage: 'screening' | 'drafting';
  promptVersion: string;
  latencyMs: number;
  attempt: number;
  ocrSource?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  await smartrecruitDb()
    .insert(campaignAiUsage)
    .values({
      tenant_id: args.session.tenant_id,
      campaign_id: args.payload.campaignId,
      candidate_id: args.payload.candidateId,
      stage: args.stage,
      model: process.env.AGENT_MODELS?.split(',')[0]?.trim() || 'openai/gpt-4o-mini',
      prompt_version: args.promptVersion,
      latency_ms: args.latencyMs,
      attempt: args.attempt,
      ocr_source: args.ocrSource ?? null,
      input_tokens: args.inputTokens ?? null,
      output_tokens: args.outputTokens ?? null,
    });
}

export const campaignJobs: TaskList = {
  'smartrecruit:campaign_screen': async (raw, helpers: JobHelpers) => {
    const payload = raw as unknown as CoordinatorPayload;
    if (!payload.campaignId || !payload.criteriaId || !payload.userId) {
      throw new Error('campaign_screen requires campaignId, criteriaId and userId');
    }
    const session = await buildActorSession({ user_id: payload.userId });
    if (await isCampaignCanceled(session, payload.campaignId)) return;
    await updateCampaignStatus({
      campaignId: payload.campaignId,
      tenantId: session.tenant_id,
      status: 'screening',
      criteriaId: payload.criteriaId,
    });
    const rows = await smartrecruitDb()
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, payload.campaignId),
          inArray(campaignCandidates.status, ['queued', 'screening']),
        ),
      );
    for (const row of rows) {
      await helpers.addJob(
        'smartrecruit:screen_candidate',
        { ...payload, campaignCandidateId: row.id, candidateId: row.candidate_id },
        { jobKey: `${payload.campaignId}:${row.candidate_id}:screening`, maxAttempts: 3 },
      );
    }
    if (rows.length === 0) await advanceWithoutItem(session, payload.campaignId, 'screening');
  },

  'smartrecruit:screen_candidate': async (raw, helpers: JobHelpers) => {
    const payload = raw as unknown as ItemPayload;
    if (!payload.criteriaId) throw new Error('screen_candidate requires criteriaId');
    const session = await buildActorSession({ user_id: payload.userId });
    const db = smartrecruitDb();
    const [row] = await db
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.id, payload.campaignCandidateId),
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, payload.campaignId),
        ),
      )
      .limit(1);
    if (!row || TERMINAL.screening.has(row.status)) return;
    if (await isCampaignCanceled(session, payload.campaignId)) return;
    const [candidate] = await db
      .select()
      .from(candidates)
      .where(
        and(eq(candidates.id, payload.candidateId), eq(candidates.tenant_id, session.tenant_id)),
      )
      .limit(1);
    if (!candidate) throw new Error(`Candidate ${payload.candidateId} not found`);

    await db
      .update(campaignCandidates)
      .set({
        status: 'screening',
        screening_attempts: helpers.job.attempts,
        last_attempt_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(campaignCandidates.id, row.id));
    const startedAt = Date.now();
    try {
      const screened = await screenCv({
        existingCandidateId: candidate.id,
        candidateName: candidate.display_name,
        candidateEmail: candidate.email,
        candidatePhone: candidate.phone ?? undefined,
        cvPath: candidate.cv_path ?? undefined,
        cvText: candidate.cv_text ?? '',
        criteriaId: payload.criteriaId,
        session,
      });
      await recordAiUsage({
        session,
        payload,
        stage: 'screening',
        promptVersion: SCREENING_PROMPT_VERSION,
        latencyMs: Date.now() - startedAt,
        attempt: helpers.job.attempts,
        ocrSource: screened.report.ocrSource,
        inputTokens: screened.inputTokens,
        outputTokens: screened.outputTokens,
      });
      await withEmit(actor(session), async (tx) => {
        if (await isCampaignCanceledTx(tx, session, payload.campaignId)) return;
        const requiresHumanReview = Boolean(screened.report.security?.requiresHumanReview);
        await tx
          .update(campaignCandidates)
          .set({
            status:
              !requiresHumanReview && isShortlistedScore(screened.fitScore)
                ? 'shortlisted'
                : 'screened',
            fit_score: screened.fitScore,
            screening_report: screened.report,
            error_reason: null,
            last_error_code: null,
            screened_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await advanceStage(tx, session, payload.campaignId, 'screening');
      });
    } catch (err) {
      const info = errorInfo(err);
      await recordAiUsage({
        session,
        payload,
        stage: 'screening',
        promptVersion: SCREENING_PROMPT_VERSION,
        latencyMs: Date.now() - startedAt,
        attempt: helpers.job.attempts,
      });
      if (info.transient && !isFinalAttempt(helpers)) {
        await db
          .update(campaignCandidates)
          .set({ error_reason: info.message, last_error_code: info.code, updated_at: new Date() })
          .where(eq(campaignCandidates.id, row.id));
        throw err;
      }
      await withEmit(actor(session), async (tx) => {
        if (await isCampaignCanceledTx(tx, session, payload.campaignId)) return;
        await tx
          .update(campaignCandidates)
          .set({
            status: 'screening_failed',
            error_reason: info.message,
            last_error_code: info.code,
            screened_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await advanceStage(tx, session, payload.campaignId, 'screening');
      });
      log.error(
        { err, campaignId: payload.campaignId, candidateId: payload.candidateId },
        'Screening failed',
      );
    }
  },

  'smartrecruit:campaign_draft_outreach': async (raw, helpers: JobHelpers) => {
    const payload = raw as unknown as CoordinatorPayload;
    const session = await buildActorSession({ user_id: payload.userId });
    if (await isCampaignCanceled(session, payload.campaignId)) return;
    await updateCampaignStatus({
      campaignId: payload.campaignId,
      tenantId: session.tenant_id,
      status: 'drafting',
    });
    const rows = await smartrecruitDb()
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, payload.campaignId),
          inArray(campaignCandidates.status, ['shortlisted', 'drafting', 'screened']),
        ),
      );
    for (const row of rows) {
      await helpers.addJob(
        'smartrecruit:draft_candidate',
        { ...payload, campaignCandidateId: row.id, candidateId: row.candidate_id },
        { jobKey: `${payload.campaignId}:${row.candidate_id}:drafting`, maxAttempts: 3 },
      );
    }
    if (rows.length === 0) await advanceWithoutItem(session, payload.campaignId, 'drafting');
  },

  'smartrecruit:draft_candidate': async (raw, helpers: JobHelpers) => {
    const payload = raw as unknown as ItemPayload;
    const session = await buildActorSession({ user_id: payload.userId });
    const db = smartrecruitDb();
    const [row] = await db
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.id, payload.campaignCandidateId),
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, payload.campaignId),
        ),
      )
      .limit(1);
    if (!row || TERMINAL.drafting.has(row.status)) return;
    if (await isCampaignCanceled(session, payload.campaignId)) return;
    await db
      .update(campaignCandidates)
      .set({
        status: 'drafting',
        drafting_attempts: helpers.job.attempts,
        last_attempt_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(campaignCandidates.id, row.id));
    const startedAt = Date.now();
    try {
      const [existing] = await db
        .select()
        .from(outreachDrafts)
        .where(
          and(
            eq(outreachDrafts.tenant_id, session.tenant_id),
            eq(outreachDrafts.campaign_id, payload.campaignId),
            eq(outreachDrafts.candidate_id, payload.candidateId),
            inArray(outreachDrafts.status, ['draft', 'approved']),
          ),
        )
        .limit(1);
      const draft =
        existing ??
        (await draftOutreach({
          candidateId: payload.candidateId,
          templateId: payload.templateId,
          campaignId: payload.campaignId,
          session,
        }));
      const inputTokens = 'inputTokens' in draft ? draft.inputTokens : undefined;
      const outputTokens = 'outputTokens' in draft ? draft.outputTokens : undefined;
      await recordAiUsage({
        session,
        payload,
        stage: 'drafting',
        promptVersion: 'outreach-v2-grounded',
        latencyMs: Date.now() - startedAt,
        attempt: helpers.job.attempts,
        inputTokens,
        outputTokens,
      });
      await withEmit(actor(session), async (tx) => {
        if (await isCampaignCanceledTx(tx, session, payload.campaignId)) return;
        await tx
          .update(outreachDrafts)
          .set({ campaign_id: payload.campaignId, updated_at: new Date() })
          .where(eq(outreachDrafts.id, draft.id));
        await tx
          .update(campaignCandidates)
          .set({
            status: 'drafted',
            draft_id: draft.id,
            error_reason: null,
            last_error_code: null,
            drafted_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await advanceStage(tx, session, payload.campaignId, 'drafting');
      });
    } catch (err) {
      const info = errorInfo(err);
      await recordAiUsage({
        session,
        payload,
        stage: 'drafting',
        promptVersion: 'outreach-v2-grounded',
        latencyMs: Date.now() - startedAt,
        attempt: helpers.job.attempts,
      });
      if (info.transient && !isFinalAttempt(helpers)) {
        await db
          .update(campaignCandidates)
          .set({ error_reason: info.message, last_error_code: info.code, updated_at: new Date() })
          .where(eq(campaignCandidates.id, row.id));
        throw err;
      }
      await withEmit(actor(session), async (tx) => {
        if (await isCampaignCanceledTx(tx, session, payload.campaignId)) return;
        await tx
          .update(campaignCandidates)
          .set({
            status: 'draft_failed',
            error_reason: info.message,
            last_error_code: info.code,
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await advanceStage(tx, session, payload.campaignId, 'drafting');
      });
    }
  },

  'smartrecruit:campaign_send_outreach': async (raw, helpers: JobHelpers) => {
    const payload = raw as unknown as CoordinatorPayload;
    const session = await buildActorSession({ user_id: payload.userId });
    if (await isCampaignCanceled(session, payload.campaignId)) return;
    await updateCampaignStatus({
      campaignId: payload.campaignId,
      tenantId: session.tenant_id,
      status: 'sending',
    });
    const approved = new Set(payload.approvedDraftIds ?? []);
    const rows = await smartrecruitDb()
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, payload.campaignId),
        ),
      );
    await smartrecruitDb()
      .update(campaignCandidates)
      .set({ status: 'rejected', updated_at: new Date() })
      .where(
        and(
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, payload.campaignId),
          eq(campaignCandidates.status, 'drafted'),
          approved.size > 0
            ? sql`${campaignCandidates.draft_id} NOT IN (${sql.join(
                [...approved].map((id) => sql`${id}::uuid`),
                sql`, `,
              )})`
            : sql`true`,
        ),
      );
    const selected = rows.filter(
      (row) => row.draft_id && approved.has(row.draft_id) && row.status !== 'sent',
    );
    for (const row of selected) {
      await helpers.addJob(
        'smartrecruit:send_candidate',
        {
          ...payload,
          campaignCandidateId: row.id,
          candidateId: row.candidate_id,
          draftId: row.draft_id,
        },
        { jobKey: `${payload.campaignId}:${row.candidate_id}:sending`, maxAttempts: 3 },
      );
    }
    if (selected.length === 0) await advanceWithoutItem(session, payload.campaignId, 'sending');
  },

  'smartrecruit:send_candidate': async (raw, helpers: JobHelpers) => {
    const payload = raw as unknown as ItemPayload;
    const draftId = payload.draftId;
    if (!draftId) throw new Error('send_candidate requires draftId');
    const session = await buildActorSession({ user_id: payload.userId });
    const db = smartrecruitDb();
    const [row] = await db
      .select()
      .from(campaignCandidates)
      .where(
        and(
          eq(campaignCandidates.id, payload.campaignCandidateId),
          eq(campaignCandidates.tenant_id, session.tenant_id),
          eq(campaignCandidates.campaign_id, payload.campaignId),
        ),
      )
      .limit(1);
    if (!row || TERMINAL.sending.has(row.status)) return;
    if (await isCampaignCanceled(session, payload.campaignId)) return;
    await db
      .update(campaignCandidates)
      .set({
        status: 'sending',
        sending_attempts: helpers.job.attempts,
        last_attempt_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(campaignCandidates.id, row.id));
    try {
      await executeOutreach({ draftId, session });
      await withEmit(actor(session), async (tx) => {
        if (await isCampaignCanceledTx(tx, session, payload.campaignId)) return;
        await tx
          .update(campaignCandidates)
          .set({
            status: 'sent',
            error_reason: null,
            last_error_code: null,
            sent_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await advanceStage(tx, session, payload.campaignId, 'sending');
      });
    } catch (err) {
      const info = errorInfo(err);
      if (info.transient && !isFinalAttempt(helpers)) {
        await db
          .update(campaignCandidates)
          .set({ error_reason: info.message, last_error_code: info.code, updated_at: new Date() })
          .where(eq(campaignCandidates.id, row.id));
        throw err;
      }
      await withEmit(actor(session), async (tx) => {
        if (await isCampaignCanceledTx(tx, session, payload.campaignId)) return;
        await tx
          .update(campaignCandidates)
          .set({
            status: 'send_failed',
            error_reason: info.message,
            last_error_code: info.code,
            updated_at: new Date(),
          })
          .where(eq(campaignCandidates.id, row.id));
        await tx
          .update(outreachDrafts)
          .set({ status: 'failed', error_reason: info.message, updated_at: new Date() })
          .where(eq(outreachDrafts.id, draftId));
        await advanceStage(tx, session, payload.campaignId, 'sending');
      });
    }
  },
};
