import { describe, expect, it } from 'vitest';
import { calculateDeterministicScore } from '../../src/backend/domain/scoring.ts';
import {
  areSkillsMatching,
  getCanonicalSkillName,
  promoteGapSkills,
} from '../../src/backend/domain/skill-gap-analyzer.ts';

describe('Skill Gap Extraction and Normalization', () => {
  it('normalizes skill names correctly based on SKILL_ALIASES', () => {
    expect(getCanonicalSkillName('k8s')).toBe('Kubernetes');
    expect(getCanonicalSkillName('KUBERNETES')).toBe('Kubernetes');
    expect(getCanonicalSkillName('postgres')).toBe('PostgreSQL');
    expect(getCanonicalSkillName('TS')).toBe('TypeScript');
    expect(getCanonicalSkillName('reactjs')).toBe('React');
    expect(getCanonicalSkillName('CustomSkill')).toBe('CustomSkill');
  });

  it('matches skills case-insensitively and through aliases', () => {
    expect(areSkillsMatching('k8s', 'Kubernetes')).toBe(true);
    expect(areSkillsMatching('TypeScript', 'ts')).toBe(true);
    expect(areSkillsMatching('React', 'reactjs')).toBe(true);
    expect(areSkillsMatching('docker', 'Docker')).toBe(true);
    expect(areSkillsMatching('Custom', 'custom')).toBe(true);
    expect(areSkillsMatching('Java', 'JavaScript')).toBe(false);
  });
});

describe('Criteria Promotion Behavior', () => {
  it('promotes gap skills from nice-to-have to must-have criteria', () => {
    const mustHave = ['React', 'TypeScript'];
    const niceToHave = ['Kafka', 'Docker', 'AWS'];
    const gapSkills = ['Kafka', 'Redis']; // Kafka is in niceToHave, Redis is absent from criteria

    const result = promoteGapSkills(mustHave, niceToHave, gapSkills);

    // Kafka should be promoted to mustHave, Docker and AWS remain in niceToHave
    // Redis is absent from JD criteria, so it should not be automatically added
    expect(result.promotedMustHave).toContain('React');
    expect(result.promotedMustHave).toContain('TypeScript');
    expect(result.promotedMustHave).toContain('Kafka');
    expect(result.promotedMustHave).not.toContain('Redis');

    expect(result.promotedNiceToHave).toContain('Docker');
    expect(result.promotedNiceToHave).toContain('AWS');
    expect(result.promotedNiceToHave).not.toContain('Kafka');
    expect(result.promotedNiceToHave).not.toContain('Redis');
  });
});

describe('Candidate Scoring with Prioritized Gap Skills', () => {
  const weights = { mustHaveSkills: 50, yoe: 15, english: 15, niceToHave: 20 };

  it('scores candidates covering prioritized gap skills via regular criteria path', () => {
    // Candidate covers a Must-Have skill that was promoted/prioritized (Kafka)
    const result = calculateDeterministicScore({
      mustHaveSkills: ['React', 'Kafka'], // Kafka is must-have (promoted gap)
      niceToHaveSkills: [],
      mustHaveMatches: [
        {
          jdSkill: 'React',
          cvSkill: 'React',
          matched: true,
          justification: 'Used React',
          evidenceSnippet: 'React evidence',
        },
        {
          jdSkill: 'Kafka',
          cvSkill: 'Kafka',
          matched: true,
          justification:
            'Kafka matched: prioritized because the team currently lacks Kafka coverage',
          evidenceSnippet: 'Used Apache Kafka for messaging',
        },
      ],
      niceToHaveMatches: [],
      totalYoe: 5,
      minYoe: 5,
      englishRequired: null,
      weights,
    });

    // Both Must-Have skills matched (React, Kafka) -> 50% must-have score
    expect(result.scoreBreakdown.mustHaveSkills).toBe(50);
    expect(result.scoreBreakdown.yoe).toBe(15);
    expect(result.scoreBreakdown.english).toBe(15);
    expect(result.scoreBreakdown.niceToHave).toBe(20);
    expect(result.fitScore).toBe(100);
  });

  it('does not give credit to candidates missing prioritized gap skills', () => {
    // Candidate misses Kafka (promoted gap must-have skill)
    const result = calculateDeterministicScore({
      mustHaveSkills: ['React', 'Kafka'], // Kafka is must-have (promoted gap)
      niceToHaveSkills: [],
      mustHaveMatches: [
        {
          jdSkill: 'React',
          cvSkill: 'React',
          matched: true,
          justification: 'Used React',
          evidenceSnippet: 'React evidence',
        },
        {
          jdSkill: 'Kafka',
          cvSkill: null,
          matched: false,
          justification: 'Kafka missing: candidate does not cover a critical team skill gap',
          evidenceSnippet: null,
        },
      ],
      niceToHaveMatches: [],
      totalYoe: 5,
      minYoe: 5,
      englishRequired: null,
      weights,
    });

    // Only 1 of 2 Must-Have skills matched (React) -> 25% must-have score
    expect(result.scoreBreakdown.mustHaveSkills).toBe(25);
    expect(result.scoreBreakdown.yoe).toBe(15);
    expect(result.scoreBreakdown.english).toBe(15);
    expect(result.scoreBreakdown.niceToHave).toBe(20);
    expect(result.fitScore).toBe(75);
  });
});
