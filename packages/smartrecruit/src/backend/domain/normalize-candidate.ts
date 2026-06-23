export function normalizeEnglishLevel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();

  if (/fluent|native|bilingual|expert|c1|c2|professional/i.test(normalized)) {
    return 'C1';
  }
  if (/upper[- ]?intermediate|advanced|b2/i.test(normalized)) {
    return 'B2';
  }
  if (/intermediate|conversational|b1/i.test(normalized)) {
    return 'B1';
  }
  if (/pre[- ]?intermediate|limited|basic|elementary|a2/i.test(normalized)) {
    return 'A2';
  }
  if (/a1|beginner/i.test(normalized)) {
    return 'A1';
  }

  // Fallback to uppercase representation if it's already a clean CEFR level
  const cleanCEFR = normalized.toUpperCase().match(/^[A-C][1-2]$/);
  if (cleanCEFR) {
    return cleanCEFR[0];
  }

  return raw;
}

export function normalizeBoolean(raw: unknown): boolean {
  if (raw === null || raw === undefined) return false;
  if (typeof raw === 'boolean') return raw;
  const str = String(raw).trim().toLowerCase();
  return str === 'y' || str === 'yes' || str === 'true' || str === '1' || str === 't';
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  const prefix = trimmed.startsWith('+') ? '+' : '';
  const digits = trimmed.replace(/\D/g, '');
  return digits ? `${prefix}${digits}` : null;
}

export function normalizeSeniority(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const value = raw.trim().toLowerCase();
  if (/intern|fresher|graduate/.test(value)) return 'Intern/Fresher';
  if (/junior|entry/.test(value)) return 'Junior';
  if (/middle|mid-level|mid level/.test(value)) return 'Middle';
  if (/senior|sr\.?/.test(value)) return 'Senior';
  if (/lead|principal|architect|manager/.test(value)) return 'Lead+';
  return raw.trim();
}

export interface RawCandidateInput {
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  cvPath?: string;
  cvText: string;
  englishLevel?: string;
  reEngagementEligible?: unknown;
}

export function normalizeCandidateInput<T extends RawCandidateInput>(cand: T): T {
  return {
    ...cand,
    candidateName: cand.candidateName.trim(),
    candidateEmail: normalizeEmail(cand.candidateEmail),
    candidatePhone: normalizePhone(cand.candidatePhone) ?? undefined,
    englishLevel: normalizeEnglishLevel(cand.englishLevel),
    reEngagementEligible: normalizeBoolean(cand.reEngagementEligible),
  };
}
