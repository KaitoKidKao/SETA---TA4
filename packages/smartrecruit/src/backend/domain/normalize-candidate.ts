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
    candidateEmail: cand.candidateEmail.trim().toLowerCase(),
    candidatePhone: cand.candidatePhone?.trim() || undefined,
    englishLevel: normalizeEnglishLevel(cand.englishLevel),
    reEngagementEligible: normalizeBoolean(cand.reEngagementEligible),
  };
}
