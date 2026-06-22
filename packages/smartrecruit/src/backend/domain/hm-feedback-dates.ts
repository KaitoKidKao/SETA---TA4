import { HM_FEEDBACK_SLA_HOURS } from './hm-feedback-policy.ts';

export type ExcelDateSystem = '1900' | '1904';

export interface HmFeedbackImportRow {
  feedback_id?: unknown;
  candidate_name?: unknown;
  position?: unknown;
  hiring_manager?: unknown;
  hiring_manager_email?: unknown;
  recruiter_owner_email?: unknown;
  shortlisted_datetime?: unknown;
  feedback_deadline_48h?: unknown;
  sla_breach?: unknown;
  feedback_status?: unknown;
  hm_decision?: unknown;
  hm_feedback_text?: unknown;
}

export interface NormalizedHmFeedbackRow {
  externalFeedbackId: string;
  candidateName: string;
  position: string;
  hiringManager: string;
  hiringManagerEmail: string | null;
  recruiterOwnerEmail: string | null;
  shortlistedAt: Date;
  feedbackDueAt: Date;
  sourceSlaBreach: boolean | null;
  feedbackStatus: string;
  hmDecision: string | null;
  hmFeedbackText: string | null;
}

export interface HmFeedbackRowError {
  code: 'MISSING_FEEDBACK_ID' | 'INVALID_SHORTLIST_DATE' | 'INVALID_DEADLINE_DATE';
  field: string;
  message: string;
}

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function nullableText(value: unknown): string | null {
  const normalized = text(value);
  return normalized || null;
}

function timezoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const asUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return asUtc - date.getTime();
}

function localDateTimeToUtc(value: string, timeZone: string): Date | null {
  const match = value.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/,
  );
  if (!match) return null;
  const wallClock = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  );
  let instant = new Date(wallClock);
  instant = new Date(wallClock - timezoneOffsetMs(instant, timeZone));
  instant = new Date(wallClock - timezoneOffsetMs(instant, timeZone));
  return Number.isNaN(instant.getTime()) ? null : instant;
}

export function excelSerialToDate(serial: number, dateSystem: ExcelDateSystem): Date | null {
  if (!Number.isFinite(serial)) return null;
  const epoch = dateSystem === '1904' ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const result = new Date(epoch + serial * 86_400_000);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function parseHmFeedbackDate(
  value: unknown,
  options: { dateSystem?: ExcelDateSystem; timeZone: string },
): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value);
  if (typeof value === 'number') return excelSerialToDate(value, options.dateSystem ?? '1900');
  const raw = text(value);
  if (!raw) return null;
  if (/^-?\d+(?:\.\d+)?$/.test(raw)) {
    return excelSerialToDate(Number(raw), options.dateSystem ?? '1900');
  }
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(raw)) {
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return localDateTimeToUtc(raw, options.timeZone);
}

export function normalizeHmFeedbackRow(
  row: HmFeedbackImportRow,
  options: { dateSystem?: ExcelDateSystem; timeZone: string },
): { ok: true; value: NormalizedHmFeedbackRow } | { ok: false; errors: HmFeedbackRowError[] } {
  const errors: HmFeedbackRowError[] = [];
  const externalFeedbackId = text(row.feedback_id);
  if (!externalFeedbackId) {
    errors.push({
      code: 'MISSING_FEEDBACK_ID',
      field: 'feedback_id',
      message: 'feedback_id is required.',
    });
  }
  const shortlistedAt = parseHmFeedbackDate(row.shortlisted_datetime, options);
  if (!shortlistedAt) {
    errors.push({
      code: 'INVALID_SHORTLIST_DATE',
      field: 'shortlisted_datetime',
      message: 'shortlisted_datetime must be a valid Excel or date value.',
    });
  }
  let feedbackDueAt = parseHmFeedbackDate(row.feedback_deadline_48h, options);
  if (text(row.feedback_deadline_48h) && !feedbackDueAt) {
    errors.push({
      code: 'INVALID_DEADLINE_DATE',
      field: 'feedback_deadline_48h',
      message: 'feedback_deadline_48h must be a valid Excel or date value.',
    });
  }
  if (errors.length > 0 || !shortlistedAt) return { ok: false, errors };
  feedbackDueAt ??= new Date(shortlistedAt.getTime() + HM_FEEDBACK_SLA_HOURS * 60 * 60 * 1000);
  const sourceFlag = text(row.sla_breach).toUpperCase();
  return {
    ok: true,
    value: {
      externalFeedbackId,
      candidateName: text(row.candidate_name) || 'Unknown candidate',
      position: text(row.position) || 'Unknown position',
      hiringManager: text(row.hiring_manager) || 'Hiring Manager',
      hiringManagerEmail: nullableText(row.hiring_manager_email),
      recruiterOwnerEmail: nullableText(row.recruiter_owner_email),
      shortlistedAt,
      feedbackDueAt,
      sourceSlaBreach: sourceFlag ? sourceFlag === 'Y' : null,
      feedbackStatus: text(row.feedback_status) || 'Pending',
      hmDecision: nullableText(row.hm_decision),
      hmFeedbackText: nullableText(row.hm_feedback_text),
    },
  };
}
