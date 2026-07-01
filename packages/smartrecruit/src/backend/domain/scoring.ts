import { isInstructionLikeText } from './cv-security.ts';

export const SCREENING_PROMPT_VERSION = 'screening-v2-evidence-extraction';
export const SCORING_VERSION = 'deterministic-v1';

export interface SkillMatch {
  jdSkill: string;
  cvSkill: string | null;
  matched: boolean;
  justification: string;
  evidenceSnippet?: string | null;
}

export interface DeterministicScoreInput {
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  mustHaveMatches: SkillMatch[];
  niceToHaveMatches: SkillMatch[];
  totalYoe: number;
  minYoe: number;
  englishRequired?: string | null;
  englishLevel?: string | null;
  englishEvidence?: string | null;
  weights: {
    mustHaveSkills: number;
    yoe: number;
    english: number;
    niceToHave: number;
  };
}

const CEFR_RANK: Record<string, number> = {
  A1: 1,
  A2: 2,
  B1: 3,
  INTERMEDIATE: 3,
  B2: 4,
  UPPER_INTERMEDIATE: 4,
  C1: 5,
  ADVANCED: 5,
  FLUENT: 5,
  C2: 6,
  NATIVE: 6,
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function normalizeLevel(value?: string | null): number | null {
  if (!value) return null;
  const key = value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
  return CEFR_RANK[key] ?? null;
}

function sanitizeMatches(criteriaSkills: string[], matches: SkillMatch[]) {
  let evidenceMissing = false;
  let invalidEvidencePromptInjection = false;
  const bySkill = new Map(matches.map((match) => [match.jdSkill.trim().toLowerCase(), match]));
  const sanitized = criteriaSkills.map((skill) => {
    const supplied = bySkill.get(skill.trim().toLowerCase());
    const hasEvidence = Boolean(supplied?.evidenceSnippet?.trim());
    const evidenceIsInstruction = isInstructionLikeText(supplied?.evidenceSnippet);
    if (supplied?.matched && !hasEvidence) evidenceMissing = true;
    if (supplied?.matched && evidenceIsInstruction) invalidEvidencePromptInjection = true;
    return {
      jdSkill: skill,
      cvSkill: supplied?.cvSkill ?? null,
      matched: Boolean(supplied?.matched && hasEvidence && !evidenceIsInstruction),
      justification: evidenceIsInstruction
        ? 'Evidence ignored because it contains instruction-like text from the CV.'
        : (supplied?.justification ?? 'No evidence found in the CV.'),
      evidenceSnippet: hasEvidence && !evidenceIsInstruction ? supplied?.evidenceSnippet : null,
    } satisfies SkillMatch;
  });
  return { sanitized, evidenceMissing, invalidEvidencePromptInjection };
}

function weightedRatio(matches: SkillMatch[], weight: number): number {
  if (matches.length === 0) return weight;
  return round1((matches.filter((match) => match.matched).length / matches.length) * weight);
}

export function calculateDeterministicScore(input: DeterministicScoreInput) {
  const mustHave = sanitizeMatches(input.mustHaveSkills, input.mustHaveMatches);
  const niceToHave = sanitizeMatches(input.niceToHaveSkills, input.niceToHaveMatches);
  const yoeRatio = input.minYoe <= 0 ? 1 : Math.min(Math.max(input.totalYoe, 0) / input.minYoe, 1);
  const requiredEnglish = normalizeLevel(input.englishRequired);
  const candidateEnglish = normalizeLevel(input.englishLevel);
  const englishMet =
    requiredEnglish === null ||
    (candidateEnglish !== null &&
      candidateEnglish >= requiredEnglish &&
      Boolean(input.englishEvidence?.trim()));
  const scoreBreakdown = {
    mustHaveSkills: weightedRatio(mustHave.sanitized, input.weights.mustHaveSkills),
    yoe: round1(yoeRatio * input.weights.yoe),
    english: englishMet ? input.weights.english : 0,
    niceToHave: weightedRatio(niceToHave.sanitized, input.weights.niceToHave),
  };
  const flags = [
    ...(mustHave.evidenceMissing || niceToHave.evidenceMissing ? ['EVIDENCE_MISSING'] : []),
    ...(mustHave.invalidEvidencePromptInjection || niceToHave.invalidEvidencePromptInjection
      ? ['INVALID_EVIDENCE_PROMPT_INJECTION']
      : []),
    ...(requiredEnglish !== null && candidateEnglish === null ? ['ENGLISH_EVIDENCE_MISSING'] : []),
  ];
  return {
    fitScore: Math.max(
      0,
      Math.min(
        100,
        Math.round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0)),
      ),
    ),
    scoreBreakdown,
    mustHaveMatches: mustHave.sanitized,
    niceToHaveMatches: niceToHave.sanitized,
    flags,
  };
}
