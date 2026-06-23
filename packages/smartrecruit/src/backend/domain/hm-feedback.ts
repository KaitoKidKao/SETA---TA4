import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { parseMailerEnv, resolveTransport } from '@seta/shared-mailer';
import { and, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import xlsx from 'xlsx';
import {
  requirePermission,
  SMARTRECRUIT_HM_FEEDBACK_APPROVE,
  SMARTRECRUIT_WRITE,
} from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { hmFeedbackReminderAttempts, hmFeedbackRequests } from '../db/schema.ts';
import {
  type ExcelDateSystem,
  type HmFeedbackImportRow,
  normalizeHmFeedbackRow,
} from './hm-feedback-dates.ts';
import {
  buildReminderIdempotencyKey,
  canApproveReminder,
  deriveHmFeedbackSla,
  type HmFeedbackReminderStage,
  type HmFeedbackSlaState,
  reminderStageForState,
} from './hm-feedback-policy.ts';
import { renderHmFeedbackReminder } from './hm-feedback-reminder.ts';

export interface ImportHmFeedbackInput {
  filePath: string;
  session: SessionScope;
  timeZone?: string;
}

export interface ImportHmFeedbackOutput {
  created: number;
  updated: number;
  skipped: number;
  invalid: Array<{
    rowNumber: number;
    errors: Array<{ code: string; field: string; message: string }>;
  }>;
}

export interface HmFeedbackTrackerItem {
  id: string;
  feedbackId: string;
  candidateName: string;
  position: string;
  hiringManager: string;
  hiringManagerEmail: string | null;
  shortlistedAt: string;
  feedbackDueAt: string;
  slaState: HmFeedbackSlaState;
  remainingSeconds: number | null;
  feedbackStatus: string;
  hmDecision: string | null;
  hmFeedbackText: string | null;
  reminderAvailable: boolean;
  reminderStage: HmFeedbackReminderStage | null;
  latestReminder: {
    id: string;
    stage: HmFeedbackReminderStage;
    status: string;
    queuedAt: string | null;
    sentAt: string | null;
    failureCode: string | null;
  } | null;
}

export interface ListHmFeedbackInput {
  tenantId: string;
  status?: 'all' | HmFeedbackSlaState;
  search?: string;
  now?: Date;
}

function isDate1904(workbook: xlsx.WorkBook): boolean {
  return Boolean(workbook.Workbook?.WBProps?.date1904);
}

function rowValue(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) return row[key];
  }
  return undefined;
}

function normalizeSheetRow(row: Record<string, unknown>): HmFeedbackImportRow {
  return {
    feedback_id: rowValue(row, 'feedback_id', 'Feedback ID'),
    candidate_name: rowValue(row, 'candidate_name', 'Candidate Name'),
    position: rowValue(row, 'position', 'Position'),
    hiring_manager: rowValue(row, 'hiring_manager', 'Hiring Manager'),
    hiring_manager_email: rowValue(row, 'hiring_manager_email', 'hm_email', 'HM Email'),
    recruiter_owner_email: rowValue(row, 'recruiter_owner_email', 'recruiter_email'),
    shortlisted_datetime: rowValue(row, 'shortlisted_datetime', 'Shortlisted Datetime'),
    feedback_deadline_48h: rowValue(row, 'feedback_deadline_48h', 'Feedback Deadline 48h'),
    sla_breach: rowValue(row, 'sla_breach', 'SLA Breach'),
    feedback_status: rowValue(row, 'feedback_status', 'Feedback Status'),
    hm_decision: rowValue(row, 'hm_decision', 'HM Decision'),
    hm_feedback_text: rowValue(row, 'hm_feedback_text', 'HM Feedback Text'),
  };
}

export async function importHmFeedbackFromWorkbook(
  input: ImportHmFeedbackInput,
): Promise<ImportHmFeedbackOutput> {
  requirePermission(input.session, SMARTRECRUIT_WRITE);

  const workbook = xlsx.readFile(input.filePath, { cellDates: false });
  const sheet = workbook.Sheets.DS08_HM_Feedback_Tracker;
  const result: ImportHmFeedbackOutput = { created: 0, updated: 0, skipped: 0, invalid: [] };
  if (!sheet) return result;

  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const dateSystem: ExcelDateSystem = isDate1904(workbook) ? '1904' : '1900';
  const timeZone = input.timeZone ?? process.env.TZ ?? 'Asia/Ho_Chi_Minh';
  const db = smartrecruitDb();

  for (const [index, rawRow] of rows.entries()) {
    const normalized = normalizeHmFeedbackRow(normalizeSheetRow(rawRow), { dateSystem, timeZone });
    if (!normalized.ok) {
      result.invalid.push({ rowNumber: index + 2, errors: normalized.errors });
      continue;
    }
    const value = normalized.value;
    const [existing] = await db
      .select({ id: hmFeedbackRequests.id })
      .from(hmFeedbackRequests)
      .where(
        and(
          eq(hmFeedbackRequests.tenant_id, input.session.tenant_id),
          eq(hmFeedbackRequests.external_feedback_id, value.externalFeedbackId),
        ),
      )
      .limit(1);

    const values = {
      candidate_name: value.candidateName,
      position: value.position,
      hiring_manager: value.hiringManager,
      hiring_manager_email: value.hiringManagerEmail,
      recruiter_owner_email: value.recruiterOwnerEmail,
      shortlisted_at: value.shortlistedAt,
      feedback_due_at: value.feedbackDueAt,
      feedback_status: value.feedbackStatus,
      submitted_at: value.feedbackStatus.toLowerCase() === 'submitted' ? new Date() : null,
      hm_decision: value.hmDecision,
      hm_feedback_text: value.hmFeedbackText,
      source_sla_breach: value.sourceSlaBreach,
      source_metadata: { source: 'DS08_HM_Feedback_Tracker', dateSystem, timeZone },
      updated_at: new Date(),
    };

    if (existing) {
      await db.update(hmFeedbackRequests).set(values).where(eq(hmFeedbackRequests.id, existing.id));
      result.updated++;
    } else {
      await db.insert(hmFeedbackRequests).values({
        id: crypto.randomUUID(),
        tenant_id: input.session.tenant_id,
        external_feedback_id: value.externalFeedbackId,
        ...values,
      });
      result.created++;
    }
  }
  return result;
}

export async function listHmFeedbackTracker(
  input: ListHmFeedbackInput,
): Promise<HmFeedbackTrackerItem[]> {
  const db = smartrecruitDb();
  const filters = [eq(hmFeedbackRequests.tenant_id, input.tenantId)];
  if (input.search?.trim()) {
    const q = `%${input.search.trim()}%`;
    const searchFilter = or(
      ilike(hmFeedbackRequests.candidate_name, q),
      ilike(hmFeedbackRequests.hiring_manager, q),
      ilike(hmFeedbackRequests.position, q),
    );
    if (searchFilter) filters.push(searchFilter);
  }

  const rows = await db
    .select()
    .from(hmFeedbackRequests)
    .where(and(...filters))
    .orderBy(hmFeedbackRequests.feedback_due_at);

  const requestIds = rows.map((row) => row.id);
  const attempts =
    requestIds.length > 0
      ? await db
          .select()
          .from(hmFeedbackReminderAttempts)
          .where(
            and(
              eq(hmFeedbackReminderAttempts.tenant_id, input.tenantId),
              inArray(hmFeedbackReminderAttempts.feedback_request_id, requestIds),
            ),
          )
          .orderBy(desc(hmFeedbackReminderAttempts.created_at))
      : [];
  const latestByRequest = new Map<string, (typeof attempts)[number]>();
  for (const attempt of attempts) {
    if (!latestByRequest.has(attempt.feedback_request_id)) {
      latestByRequest.set(attempt.feedback_request_id, attempt);
    }
  }

  return rows
    .map((row) => {
      const sla = deriveHmFeedbackSla({
        dueAt: row.feedback_due_at,
        submittedAt: row.submitted_at,
        feedbackStatus: row.feedback_status,
        now: input.now,
      });
      const stage = reminderStageForState(sla.state);
      const latest = latestByRequest.get(row.id);
      return {
        id: row.id,
        feedbackId: row.external_feedback_id,
        candidateName: row.candidate_name,
        position: row.position,
        hiringManager: row.hiring_manager,
        hiringManagerEmail: row.hiring_manager_email,
        shortlistedAt: row.shortlisted_at.toISOString(),
        feedbackDueAt: row.feedback_due_at.toISOString(),
        slaState: sla.state,
        remainingSeconds: sla.remainingSeconds,
        feedbackStatus: row.feedback_status,
        hmDecision: row.hm_decision,
        hmFeedbackText: row.hm_feedback_text,
        reminderAvailable:
          canApproveReminder({ state: sla.state, hiringManagerEmail: row.hiring_manager_email })
            .allowed && !latest,
        reminderStage: stage,
        latestReminder: latest
          ? {
              id: latest.id,
              stage: latest.stage as HmFeedbackReminderStage,
              status: latest.status,
              queuedAt: latest.queued_at?.toISOString() ?? null,
              sentAt: latest.sent_at?.toISOString() ?? null,
              failureCode: latest.failure_code,
            }
          : null,
      } satisfies HmFeedbackTrackerItem;
    })
    .filter((item) => !input.status || input.status === 'all' || item.slaState === input.status);
}

export async function prepareHmFeedbackReminderDraft(input: {
  tenantId: string;
  feedbackRequestId: string;
  now?: Date;
}): Promise<typeof hmFeedbackReminderAttempts.$inferSelect> {
  const db = smartrecruitDb();
  const [request] = await db
    .select()
    .from(hmFeedbackRequests)
    .where(
      and(
        eq(hmFeedbackRequests.tenant_id, input.tenantId),
        eq(hmFeedbackRequests.id, input.feedbackRequestId),
      ),
    )
    .limit(1);
  if (!request) throw new Error('HM feedback request not found.');

  const sla = deriveHmFeedbackSla({
    dueAt: request.feedback_due_at,
    submittedAt: request.submitted_at,
    feedbackStatus: request.feedback_status,
    now: input.now,
  });
  const stage = reminderStageForState(sla.state);
  if (!stage) throw new Error('HM feedback request is not eligible for a reminder.');

  const content = renderHmFeedbackReminder({
    stage,
    hiringManager: request.hiring_manager,
    candidateName: request.candidate_name,
    position: request.position,
    feedbackDueAt: request.feedback_due_at,
  });
  const idempotencyKey = buildReminderIdempotencyKey({
    feedbackRequestId: request.id,
    stage,
    dueAt: request.feedback_due_at,
  });

  const [existing] = await db
    .select()
    .from(hmFeedbackReminderAttempts)
    .where(
      and(
        eq(hmFeedbackReminderAttempts.tenant_id, input.tenantId),
        eq(hmFeedbackReminderAttempts.idempotency_key, idempotencyKey),
      ),
    )
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(hmFeedbackReminderAttempts)
    .values({
      id: crypto.randomUUID(),
      tenant_id: input.tenantId,
      feedback_request_id: request.id,
      stage,
      recipient_email: request.hiring_manager_email,
      subject: content.subject,
      body: content.body,
      idempotency_key: idempotencyKey,
    })
    .returning();
  if (!created) throw new Error('Failed to create HM reminder draft.');
  return created;
}

export async function approveHmFeedbackReminder(input: {
  tenantId: string;
  feedbackRequestId: string;
  session: SessionScope;
  addJob: (
    taskName: string,
    payload: unknown,
    opts?: { jobKey?: string; maxAttempts?: number },
  ) => Promise<void>;
}): Promise<typeof hmFeedbackReminderAttempts.$inferSelect> {
  requirePermission(input.session, SMARTRECRUIT_HM_FEEDBACK_APPROVE);
  let attempt!: typeof hmFeedbackReminderAttempts.$inferSelect;
  let shouldQueue = false;

  await withEmit(
    { actor: { userId: input.session.user_id, tenantId: input.tenantId } },
    async (tx) => {
      const [request] = await tx
        .select()
        .from(hmFeedbackRequests)
        .where(
          and(
            eq(hmFeedbackRequests.tenant_id, input.tenantId),
            eq(hmFeedbackRequests.id, input.feedbackRequestId),
          ),
        )
        .limit(1);
      if (!request) throw new Error('HM feedback request not found.');

      const sla = deriveHmFeedbackSla({
        dueAt: request.feedback_due_at,
        submittedAt: request.submitted_at,
        feedbackStatus: request.feedback_status,
      });
      const approval = canApproveReminder({
        state: sla.state,
        hiringManagerEmail: request.hiring_manager_email,
      });
      if (!approval.allowed) throw new Error(approval.reason);

      const stage = reminderStageForState(sla.state);
      if (!stage) throw new Error('HM feedback request is not eligible for a reminder.');
      const content = renderHmFeedbackReminder({
        stage,
        hiringManager: request.hiring_manager,
        candidateName: request.candidate_name,
        position: request.position,
        feedbackDueAt: request.feedback_due_at,
      });
      const idempotencyKey = buildReminderIdempotencyKey({
        feedbackRequestId: request.id,
        stage,
        dueAt: request.feedback_due_at,
      });

      const [existing] = await tx
        .select()
        .from(hmFeedbackReminderAttempts)
        .where(
          and(
            eq(hmFeedbackReminderAttempts.tenant_id, input.tenantId),
            eq(hmFeedbackReminderAttempts.idempotency_key, idempotencyKey),
          ),
        )
        .limit(1);
      if (existing && existing.status !== 'draft') {
        attempt = existing;
        return;
      }

      const now = new Date();
      if (existing) {
        const [updated] = await tx
          .update(hmFeedbackReminderAttempts)
          .set({
            status: 'queued',
            recipient_email: request.hiring_manager_email,
            subject: existing.subject || content.subject,
            body: existing.body || content.body,
            approved_by: input.session.user_id,
            approved_at: now,
            queued_at: now,
            updated_at: now,
          })
          .where(eq(hmFeedbackReminderAttempts.id, existing.id))
          .returning();
        if (!updated) throw new Error('Failed to queue HM feedback reminder.');
        attempt = updated;
        shouldQueue = true;
      } else {
        const [created] = await tx
          .insert(hmFeedbackReminderAttempts)
          .values({
            id: crypto.randomUUID(),
            tenant_id: input.tenantId,
            feedback_request_id: request.id,
            stage,
            recipient_email: request.hiring_manager_email,
            subject: content.subject,
            body: content.body,
            status: 'queued',
            idempotency_key: idempotencyKey,
            approved_by: input.session.user_id,
            approved_at: now,
            queued_at: now,
          })
          .returning();
        if (!created) throw new Error('Failed to queue HM feedback reminder.');
        attempt = created;
        shouldQueue = true;
      }
      await emit({
        tenantId: input.tenantId,
        aggregateType: 'smartrecruit_hm_feedback',
        aggregateId: request.id,
        eventType: 'smartrecruit.hm_feedback.reminder_queued',
        eventVersion: 1,
        causedByUserId: input.session.user_id,
        payload: {
          feedbackRequestId: request.id,
          reminderAttemptId: attempt.id,
          stage,
        },
      });
    },
  );

  if (shouldQueue && attempt.status === 'queued') {
    await input.addJob(
      'smartrecruit:hm_feedback_reminder_send',
      { attemptId: attempt.id, userId: input.session.user_id },
      { jobKey: attempt.id, maxAttempts: 3 },
    );
  }
  return attempt;
}

export async function sendHmFeedbackReminderAttempt(input: {
  attemptId: string;
  userId: string;
}): Promise<void> {
  const db = smartrecruitDb();
  const [attempt] = await db
    .select()
    .from(hmFeedbackReminderAttempts)
    .where(eq(hmFeedbackReminderAttempts.id, input.attemptId))
    .limit(1);
  if (!attempt || attempt.status === 'sent') return;
  if (!attempt.recipient_email) throw new Error('Reminder attempt is missing recipient email.');

  try {
    const env = parseMailerEnv(process.env);
    const resolved = await resolveTransport(attempt.tenant_id, {
      env,
      configStore: { findEnabled: async () => null },
      lookupEntraTenantId: async () => null,
      crypto: { decrypt: async () => '' },
    });
    const sent = await resolved.transport.send({
      from: resolved.sender,
      fromDisplayName: resolved.senderDisplayName,
      to: attempt.recipient_email,
      subject: attempt.subject,
      text: attempt.body,
      html: attempt.body.replace(/\n/g, '<br>'),
    });
    await withEmit(undefined, async (tx) => {
      await tx
        .update(hmFeedbackReminderAttempts)
        .set({
          status: 'sent',
          sent_at: new Date(),
          provider_message_id: sent.messageId,
          updated_at: new Date(),
        })
        .where(eq(hmFeedbackReminderAttempts.id, attempt.id));
      await emit({
        tenantId: attempt.tenant_id,
        aggregateType: 'smartrecruit_hm_feedback',
        aggregateId: attempt.feedback_request_id,
        eventType: 'smartrecruit.hm_feedback.reminder_sent',
        eventVersion: 1,
        payload: {
          feedbackRequestId: attempt.feedback_request_id,
          reminderAttemptId: attempt.id,
          providerMessageId: sent.messageId,
        },
      });
    });
  } catch (err) {
    const failureCode = err instanceof Error ? err.name : 'REMINDER_SEND_FAILED';
    await withEmit(undefined, async (tx) => {
      await tx
        .update(hmFeedbackReminderAttempts)
        .set({
          status: 'failed',
          failure_code: failureCode,
          failure_message: err instanceof Error ? err.message : String(err),
          updated_at: new Date(),
        })
        .where(eq(hmFeedbackReminderAttempts.id, attempt.id));
      await emit({
        tenantId: attempt.tenant_id,
        aggregateType: 'smartrecruit_hm_feedback',
        aggregateId: attempt.feedback_request_id,
        eventType: 'smartrecruit.hm_feedback.reminder_failed',
        eventVersion: 1,
        payload: {
          feedbackRequestId: attempt.feedback_request_id,
          reminderAttemptId: attempt.id,
          failureCode,
        },
      });
    });
    throw err;
  }
}

export async function scanHmFeedbackReminderDrafts(
  input: { tenantId?: string; now?: Date } = {},
): Promise<{ prepared: number }> {
  const db = smartrecruitDb();
  const rows = await db
    .select({ id: hmFeedbackRequests.id, tenantId: hmFeedbackRequests.tenant_id })
    .from(hmFeedbackRequests)
    .where(input.tenantId ? eq(hmFeedbackRequests.tenant_id, input.tenantId) : undefined)
    .orderBy(hmFeedbackRequests.feedback_due_at);

  let prepared = 0;
  for (const row of rows) {
    try {
      await prepareHmFeedbackReminderDraft({
        tenantId: row.tenantId,
        feedbackRequestId: row.id,
        now: input.now,
      });
      prepared++;
    } catch {
      // Non-eligible rows are expected during scans; ignore and keep scanning.
    }
  }
  return { prepared };
}

export async function repairHmFeedbackSubmittedState(): Promise<void> {
  await smartrecruitDb().execute(
    sql`UPDATE smartrecruit.hm_feedback_requests
        SET submitted_at = COALESCE(submitted_at, updated_at)
        WHERE lower(feedback_status) = 'submitted' AND submitted_at IS NULL`,
  );
}
