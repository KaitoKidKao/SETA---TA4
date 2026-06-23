import { createHash } from 'node:crypto';

export const HM_FEEDBACK_SLA_HOURS = 48;
export const HM_FEEDBACK_DUE_SOON_HOURS = 12;

export type HmFeedbackSlaState = 'on_track' | 'due_soon' | 'overdue' | 'submitted' | 'data_error';

export type HmFeedbackReminderStage = 'due_soon' | 'overdue';

export function deriveHmFeedbackSla(input: {
  dueAt: Date | null;
  submittedAt?: Date | null;
  feedbackStatus?: string | null;
  now?: Date;
}): { state: HmFeedbackSlaState; remainingSeconds: number | null } {
  if (input.submittedAt || input.feedbackStatus?.trim().toLowerCase() === 'submitted') {
    return { state: 'submitted', remainingSeconds: null };
  }
  if (!input.dueAt || Number.isNaN(input.dueAt.getTime())) {
    return { state: 'data_error', remainingSeconds: null };
  }
  const now = input.now ?? new Date();
  const remainingSeconds = Math.trunc((input.dueAt.getTime() - now.getTime()) / 1000);
  if (remainingSeconds <= 0) return { state: 'overdue', remainingSeconds };
  if (remainingSeconds <= HM_FEEDBACK_DUE_SOON_HOURS * 60 * 60) {
    return { state: 'due_soon', remainingSeconds };
  }
  return { state: 'on_track', remainingSeconds };
}

export function reminderStageForState(state: HmFeedbackSlaState): HmFeedbackReminderStage | null {
  if (state === 'due_soon' || state === 'overdue') return state;
  return null;
}

export function buildReminderIdempotencyKey(input: {
  feedbackRequestId: string;
  stage: HmFeedbackReminderStage;
  dueAt: Date;
  retry?: number;
}): string {
  const source = [
    input.feedbackRequestId,
    'email',
    input.stage,
    input.dueAt.toISOString(),
    input.retry ?? 0,
  ].join(':');
  return `hm-feedback:${createHash('sha256').update(source).digest('hex')}`;
}

export function canApproveReminder(input: {
  state: HmFeedbackSlaState;
  hiringManagerEmail: string | null;
}): { allowed: true } | { allowed: false; reason: string } {
  if (input.state === 'submitted') {
    return { allowed: false, reason: 'Hiring Manager feedback has already been submitted.' };
  }
  if (input.state !== 'due_soon' && input.state !== 'overdue') {
    return { allowed: false, reason: 'This feedback request is not eligible for a reminder.' };
  }
  if (!input.hiringManagerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.hiringManagerEmail)) {
    return { allowed: false, reason: 'A valid Hiring Manager email address is required.' };
  }
  return { allowed: true };
}
