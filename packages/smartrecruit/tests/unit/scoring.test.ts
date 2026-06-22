import { describe, expect, it } from 'vitest';
import { calculateDeterministicScore } from '../../src/backend/domain/scoring.ts';

const weights = { mustHaveSkills: 50, yoe: 15, english: 15, niceToHave: 20 };

describe('calculateDeterministicScore', () => {
  it('computes weighted score from evidence-backed matches', () => {
    const result = calculateDeterministicScore({
      mustHaveSkills: ['React', 'TypeScript'],
      niceToHaveSkills: ['AWS'],
      mustHaveMatches: [
        {
          jdSkill: 'React',
          cvSkill: 'React',
          matched: true,
          justification: 'Used React',
          evidenceSnippet: 'Built React apps',
        },
        { jdSkill: 'TypeScript', cvSkill: null, matched: false, justification: 'Missing' },
      ],
      niceToHaveMatches: [
        {
          jdSkill: 'AWS',
          cvSkill: 'AWS',
          matched: true,
          justification: 'Used AWS',
          evidenceSnippet: 'Deployed to AWS',
        },
      ],
      totalYoe: 4,
      minYoe: 4,
      englishRequired: 'B2',
      englishLevel: 'C1',
      englishEvidence: 'English C1',
      weights,
    });
    expect(result.scoreBreakdown).toEqual({
      mustHaveSkills: 25,
      yoe: 15,
      english: 15,
      niceToHave: 20,
    });
    expect(result.fitScore).toBe(75);
  });

  it('rejects a claimed match without evidence', () => {
    const result = calculateDeterministicScore({
      mustHaveSkills: ['React'],
      niceToHaveSkills: [],
      mustHaveMatches: [
        {
          jdSkill: 'React',
          cvSkill: 'React',
          matched: true,
          justification: 'Claimed',
          evidenceSnippet: null,
        },
      ],
      niceToHaveMatches: [],
      totalYoe: 0,
      minYoe: 2,
      englishRequired: null,
      weights,
    });
    expect(result.mustHaveMatches[0]?.matched).toBe(false);
    expect(result.flags).toContain('EVIDENCE_MISSING');
  });
});
