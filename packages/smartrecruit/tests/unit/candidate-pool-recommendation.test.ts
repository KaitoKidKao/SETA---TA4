import { describe, expect, it } from 'vitest';
import { isCandidateRecommendationEligible } from '../../src/backend/domain/screen-candidate-pool.ts';

const baseCandidate = {
  id: 'candidate-1',
  status: 'screened',
  re_engagement_eligible: false,
  applied_position: 'Backend Engineer',
  jobTitle: 'Backend Engineer',
  excludedCandidateIds: new Set<string>(),
  recentlyContactedCandidateIds: new Set<string>(),
  hasVectorSimilarity: true,
};

describe('isCandidateRecommendationEligible', () => {
  it('excludes rejected candidates unless re-engagement is allowed', () => {
    expect(isCandidateRecommendationEligible({ ...baseCandidate, status: 'rejected' })).toBe(false);
    expect(
      isCandidateRecommendationEligible({
        ...baseCandidate,
        status: 'rejected',
        re_engagement_eligible: true,
      }),
    ).toBe(true);
  });

  it('excludes candidates already in the campaign or contacted recently', () => {
    expect(
      isCandidateRecommendationEligible({
        ...baseCandidate,
        excludedCandidateIds: new Set([baseCandidate.id]),
      }),
    ).toBe(false);
    expect(
      isCandidateRecommendationEligible({
        ...baseCandidate,
        recentlyContactedCandidateIds: new Set([baseCandidate.id]),
      }),
    ).toBe(false);
  });

  it('requires position, re-engagement, or vector evidence', () => {
    expect(
      isCandidateRecommendationEligible({
        ...baseCandidate,
        applied_position: 'Designer',
        hasVectorSimilarity: false,
      }),
    ).toBe(false);
    expect(
      isCandidateRecommendationEligible({
        ...baseCandidate,
        applied_position: null,
        hasVectorSimilarity: true,
      }),
    ).toBe(true);
  });
});
