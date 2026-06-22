import { describe, expect, it } from 'vitest';
import {
  getEffectiveFitScore,
  isShortlistedCandidate,
  isShortlistedScore,
  SHORTLIST_THRESHOLD,
} from '../../src/backend/domain/shortlist-policy.ts';

describe('shortlist policy', () => {
  it('uses one authoritative threshold', () => {
    expect(SHORTLIST_THRESHOLD).toBe(70);
    expect([69, 70, 75, 80].map(isShortlistedScore)).toEqual([false, true, true, true]);
  });

  it('uses reviewed score before AI score', () => {
    expect(getEffectiveFitScore({ fitScore: 69, reviewedFitScore: 70 })).toBe(70);
  });

  it('keeps persisted normalized status authoritative', () => {
    expect(isShortlistedCandidate({ status: 'shortlisted', fitScore: 69 })).toBe(true);
    expect(isShortlistedCandidate({ status: 'screened', fitScore: 80 })).toBe(false);
    expect(isShortlistedCandidate({ fitScore: 75 })).toBe(true);
  });
});
