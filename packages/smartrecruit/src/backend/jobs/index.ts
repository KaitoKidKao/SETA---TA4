import { buildActorSession } from '@seta/identity';
import { and, eq, inArray } from 'drizzle-orm';
import type { TaskList } from 'graphile-worker';
import pino from 'pino';
import { smartrecruitDb } from '../db/client.ts';
import { candidates } from '../db/schema.ts';
import { draftOutreach } from '../domain/draft-outreach.ts';
import { screenCv } from '../domain/screen-cv.ts';

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

export const smartrecruitJobs: TaskList = {
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
};
