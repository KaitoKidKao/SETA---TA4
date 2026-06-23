import { describe, expect, it } from 'vitest';
import {
  excelSerialToDate,
  normalizeHmFeedbackRow,
  parseHmFeedbackDate,
} from '../../src/backend/domain/hm-feedback-dates.ts';
import {
  buildReminderIdempotencyKey,
  canApproveReminder,
  deriveHmFeedbackSla,
  reminderStageForState,
} from '../../src/backend/domain/hm-feedback-policy.ts';
import { renderHmFeedbackReminder } from '../../src/backend/domain/hm-feedback-reminder.ts';

describe('HM feedback date normalization', () => {
  it('converts Excel 1900 and 1904 serial dates', () => {
    expect(excelSerialToDate(45748.6041666667, '1900')?.toISOString()).toBe(
      '2025-04-01T14:30:00.000Z',
    );
    expect(excelSerialToDate(44286.6041666667, '1904')?.toISOString()).toBe(
      '2025-04-01T14:30:00.000Z',
    );
  });

  it('parses an unzoned string using the explicit import timezone', () => {
    expect(
      parseHmFeedbackDate('2025-04-01 14:30:00', {
        timeZone: 'Asia/Ho_Chi_Minh',
      })?.toISOString(),
    ).toBe('2025-04-01T07:30:00.000Z');
  });

  it('derives a missing deadline and reports invalid dates', () => {
    const valid = normalizeHmFeedbackRow(
      { feedback_id: 'FB-1', shortlisted_datetime: '2025-04-01T10:00:00Z' },
      { timeZone: 'UTC' },
    );
    expect(valid.ok && valid.value.feedbackDueAt.toISOString()).toBe('2025-04-03T10:00:00.000Z');
    const invalid = normalizeHmFeedbackRow(
      { feedback_id: 'FB-2', shortlisted_datetime: 'not-a-date' },
      { timeZone: 'UTC' },
    );
    expect(invalid.ok).toBe(false);
  });
});

describe('HM feedback SLA policy', () => {
  const now = new Date('2025-04-03T00:00:00Z');

  it.each([
    ['on_track', '2025-04-03T13:00:01Z'],
    ['due_soon', '2025-04-03T12:00:00Z'],
    ['overdue', '2025-04-03T00:00:00Z'],
  ] as const)('derives %s', (state, dueAt) => {
    expect(deriveHmFeedbackSla({ dueAt: new Date(dueAt), now }).state).toBe(state);
  });

  it('gives submitted feedback precedence', () => {
    expect(
      deriveHmFeedbackSla({
        dueAt: new Date('2025-04-01T00:00:00Z'),
        feedbackStatus: 'Submitted',
        now,
      }).state,
    ).toBe('submitted');
  });
});

describe('HM feedback reminder policy', () => {
  it('selects only actionable stages and validates recipient state', () => {
    expect(reminderStageForState('due_soon')).toBe('due_soon');
    expect(reminderStageForState('overdue')).toBe('overdue');
    expect(reminderStageForState('submitted')).toBeNull();
    expect(
      canApproveReminder({ state: 'submitted', hiringManagerEmail: 'hm@example.com' }).allowed,
    ).toBe(false);
    expect(canApproveReminder({ state: 'overdue', hiringManagerEmail: null }).allowed).toBe(false);
    expect(
      canApproveReminder({ state: 'overdue', hiringManagerEmail: 'hm@example.com' }).allowed,
    ).toBe(true);
  });

  it('builds deterministic stage-specific idempotency keys', () => {
    const input = {
      feedbackRequestId: 'request-1',
      stage: 'overdue' as const,
      dueAt: new Date('2025-04-03T00:00:00Z'),
    };
    expect(buildReminderIdempotencyKey(input)).toBe(buildReminderIdempotencyKey(input));
    expect(buildReminderIdempotencyKey(input)).not.toBe(
      buildReminderIdempotencyKey({ ...input, stage: 'due_soon' }),
    );
  });

  it('renders clear English reminder content', () => {
    const reminder = renderHmFeedbackReminder({
      stage: 'overdue',
      hiringManager: 'Alex',
      candidateName: 'Candidate A',
      position: 'Backend Engineer',
      feedbackDueAt: new Date('2025-04-03T14:30:00Z'),
    });
    expect(reminder.subject).toContain('Overdue feedback');
    expect(reminder.body).toContain('Candidate A');
    expect(reminder.body).toContain('Backend Engineer');
  });
});
