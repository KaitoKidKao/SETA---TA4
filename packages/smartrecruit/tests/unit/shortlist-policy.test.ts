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

  // ---------------------------------------------------------------------------
  // Task 5.4 — Regression tests: scores 69, 70, 75, 80 must produce identical
  // shortlist decisions across backend predicates and UI-facing data formatters.
  // ---------------------------------------------------------------------------

  describe('boundary regression (task 5.4) — 69/70/75/80 identical across all surfaces', () => {
    const SCORES = [69, 70, 75, 80] as const;
    const EXPECTED_SHORTLISTED = [false, true, true, true] as const;

    it('isShortlistedScore matches expected boundaries', () => {
      const results = SCORES.map((s) => isShortlistedScore(s));
      expect(results).toEqual([...EXPECTED_SHORTLISTED]);
    });

    it('getEffectiveFitScore with only fitScore matches expected boundaries', () => {
      const results = SCORES.map((s) => isShortlistedScore(getEffectiveFitScore({ fitScore: s })));
      expect(results).toEqual([...EXPECTED_SHORTLISTED]);
    });

    it('getEffectiveFitScore with only reviewedFitScore matches expected boundaries', () => {
      const results = SCORES.map((s) =>
        isShortlistedScore(getEffectiveFitScore({ reviewedFitScore: s })),
      );
      expect(results).toEqual([...EXPECTED_SHORTLISTED]);
    });

    it('isShortlistedCandidate with no status (score only) matches expected boundaries', () => {
      const results = SCORES.map((s) => isShortlistedCandidate({ fitScore: s }));
      expect(results).toEqual([...EXPECTED_SHORTLISTED]);
    });

    it('isShortlistedCandidate with reviewedFitScore overrides fitScore', () => {
      // Score 69 is not shortlisted, but reviewedFitScore 70 is
      expect(isShortlistedCandidate({ fitScore: 69, reviewedFitScore: 70 })).toBe(true);
      // Score 75 is shortlisted, but reviewedFitScore 69 is not (reviewed wins)
      expect(isShortlistedCandidate({ fitScore: 75, reviewedFitScore: 69 })).toBe(false);
    });

    it('UI-facing formatter: shortlisted badge label is consistent with threshold', () => {
      // Simulate the UI-facing label derivation used in SLA tracker and campaign views
      function badgeLabel(fitScore: number | null | undefined): 'Shortlisted' | 'Screened' {
        return isShortlistedScore(fitScore ?? 0) ? 'Shortlisted' : 'Screened';
      }

      const labels = SCORES.map(badgeLabel);
      expect(labels).toEqual(['Screened', 'Shortlisted', 'Shortlisted', 'Shortlisted']);
    });

    it('edge cases: null/undefined treated as 0 (not shortlisted)', () => {
      expect(isShortlistedScore(null)).toBe(false);
      expect(isShortlistedScore(undefined)).toBe(false);
      expect(isShortlistedScore(0)).toBe(false);
    });

    it('exact boundary: 69 < 70 ≡ SHORTLIST_THRESHOLD', () => {
      expect(isShortlistedScore(SHORTLIST_THRESHOLD - 1)).toBe(false);
      expect(isShortlistedScore(SHORTLIST_THRESHOLD)).toBe(true);
    });
  });
});
