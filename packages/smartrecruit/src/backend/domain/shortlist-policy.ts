export const SHORTLIST_THRESHOLD = 70;

export function getEffectiveFitScore(input: {
  fitScore?: number | null;
  reviewedFitScore?: number | null;
}): number {
  return input.reviewedFitScore ?? input.fitScore ?? 0;
}

export function isShortlistedScore(score: number | null | undefined): boolean {
  return (score ?? 0) >= SHORTLIST_THRESHOLD;
}

export function isShortlistedCandidate(input: {
  status?: string | null;
  fitScore?: number | null;
  reviewedFitScore?: number | null;
}): boolean {
  if (input.status === 'shortlisted') return true;
  if (input.status) return false;
  return isShortlistedScore(getEffectiveFitScore(input));
}
