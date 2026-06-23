import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import xlsx from 'xlsx';
import { smartrecruitDb } from '../db/client.ts';
import { criteria, teamHireRequests, teamSkillsMatrix } from '../db/schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../..');

export const SKILL_ALIASES: Record<string, string> = {
  k8s: 'Kubernetes',
  kubernetes: 'Kubernetes',
  postgres: 'PostgreSQL',
  postgresql: 'PostgreSQL',
  typescript: 'TypeScript',
  ts: 'TypeScript',
  javascript: 'JavaScript',
  js: 'JavaScript',
  kafka: 'Kafka',
  redis: 'Redis',
  docker: 'Docker',
  playwright: 'Playwright',
  selenium: 'Selenium',
  react: 'React',
  reactjs: 'React',
  react_js: 'React',
  hono: 'Hono',
  node: 'Node.js',
  nodejs: 'Node.js',
  'node.js': 'Node.js',
};

export type SkillGapDataStatus =
  | 'gaps_found'
  | 'no_gap_detected'
  | 'no_matching_team_data'
  | 'source_unavailable';

export type SkillGapSource = 'database' | 'workbook' | 'none';

export interface SkillGapRecommendation {
  skill: string;
  source: 'DS04_Team_Skills_Matrix' | 'DS06_Hire_Request' | 'both';
  reason: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  recommendedAction: 'promote_to_must_have' | 'increase_nice_to_have_weight' | 'none';
  applied: boolean;
}

export interface SkillGapInfo {
  position: string;
  teamName: string | null;
  skillsGap: string[];
  summary: string;
  recommendations: string[];
  structuredRecommendations: SkillGapRecommendation[];
  dataStatus: SkillGapDataStatus;
  source: SkillGapSource;
}

export interface SkillMatrixRow {
  team_name?: string | null;
  proficiency_level?: string | null;
  skill?: string | null;
}

export interface HireRequestRow {
  position_title?: string | null;
  team_skill_gap_summary?: string | null;
  business_unit?: string | null;
}

interface CriteriaSkills {
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
}

export function getCanonicalSkillName(skill: string): string {
  const normalized = skill.trim().toLowerCase();
  return SKILL_ALIASES[normalized] || skill.trim();
}

export function areSkillsMatching(skillA: string, skillB: string): boolean {
  return (
    getCanonicalSkillName(skillA).toLowerCase() === getCanonicalSkillName(skillB).toLowerCase()
  );
}

export function promoteGapSkills(
  mustHaveSkills: string[],
  niceToHaveSkills: string[],
  gapSkills: string[],
): { promotedMustHave: string[]; promotedNiceToHave: string[] } {
  const promotedMustHave = [...mustHaveSkills];
  const promotedNiceToHave = [...niceToHaveSkills];

  for (const gap of gapSkills) {
    const niceIndex = promotedNiceToHave.findIndex((skill) => areSkillsMatching(skill, gap));
    if (niceIndex === -1) continue;

    const skillName = promotedNiceToHave[niceIndex];
    if (!skillName) continue;

    if (!promotedMustHave.some((skill) => areSkillsMatching(skill, gap))) {
      promotedMustHave.push(skillName);
    }
    promotedNiceToHave.splice(niceIndex, 1);
  }

  return { promotedMustHave, promotedNiceToHave };
}

function includesEither(left: string | null | undefined, right: string): boolean {
  const normalizedLeft = left?.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function compactSkill(skill: string | null | undefined): string | null {
  const trimmed = skill?.trim();
  return trimmed ? getCanonicalSkillName(trimmed) : null;
}

function extractSkillsFromSummary(summary: string, allSkills: string[]): string[] {
  if (!summary) return [];
  const found = new Set<string>();
  const candidateSkills = Array.from(
    new Set(
      [...allSkills, ...Object.keys(SKILL_ALIASES), ...Object.values(SKILL_ALIASES)]
        .map((skill) => skill?.trim())
        .filter((skill): skill is string => Boolean(skill)),
    ),
  );

  for (const skill of candidateSkills) {
    const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = /^[a-zA-Z0-9_]+$/.test(skill)
      ? new RegExp(`\\b${escaped}\\b`, 'i')
      : new RegExp(escaped, 'i');

    if (regex.test(summary)) {
      found.add(getCanonicalSkillName(skill));
    }
  }

  return Array.from(found);
}

function buildStructuredRecommendations(args: {
  uniqueGaps: string[];
  weakSkills: string[];
  extractedGaps: string[];
  teamName: string | null;
  criteriaSkills: CriteriaSkills;
}): SkillGapRecommendation[] {
  return args.uniqueGaps.map((skill) => {
    const isWeak = args.weakSkills.some((weakSkill) => areSkillsMatching(weakSkill, skill));
    const isExtracted = args.extractedGaps.some((gapSkill) => areSkillsMatching(gapSkill, skill));
    const teamName = args.teamName ?? 'the team';

    let source: SkillGapRecommendation['source'] = 'DS04_Team_Skills_Matrix';
    let reason = `Team proficiency is low or missing in the skills matrix (${teamName})`;
    let priority: SkillGapRecommendation['priority'] = 'medium';

    if (isWeak && isExtracted) {
      source = 'both';
      reason = `Team proficiency is low and identified in the hire request (${teamName})`;
      priority = 'critical';
    } else if (isExtracted) {
      source = 'DS06_Hire_Request';
      reason = `Explicitly requested to fill team skill gap in hire request (${teamName})`;
      priority = 'high';
    }

    const applied =
      args.criteriaSkills.mustHaveSkills.some((criteriaSkill) =>
        areSkillsMatching(criteriaSkill, skill),
      ) ||
      args.criteriaSkills.niceToHaveSkills.some((criteriaSkill) =>
        areSkillsMatching(criteriaSkill, skill),
      );

    const recommendedAction =
      priority === 'critical'
        ? 'promote_to_must_have'
        : priority === 'high'
          ? 'increase_nice_to_have_weight'
          : 'none';

    return {
      skill,
      source,
      reason,
      priority,
      recommendedAction,
      applied,
    };
  });
}

function buildRecommendationText(gap: SkillGapRecommendation, teamName: string | null): string {
  const teamLabel = teamName ?? 'the team';

  if (gap.applied) {
    return `Applied: Prioritized ${gap.skill} because ${gap.reason.toLowerCase()}.`;
  }
  if (gap.recommendedAction === 'promote_to_must_have') {
    return `Recommend: Add ${gap.skill} as a Must-Have skill to address a critical team gap in ${teamLabel}.`;
  }
  if (gap.recommendedAction === 'increase_nice_to_have_weight') {
    return `Recommend: Add ${gap.skill} as a Nice-to-Have skill or increase its weight to address a high-priority gap in ${teamLabel}.`;
  }
  return `Note: Consider candidate experience with ${gap.skill} to support ${teamLabel}.`;
}

export function analyzeSkillGapRows(args: {
  jobTitle: string;
  hireRequests: HireRequestRow[];
  skillsMatrix: SkillMatrixRow[];
  source: Exclude<SkillGapSource, 'none'>;
  criteriaSkills?: CriteriaSkills;
}): SkillGapInfo {
  const criteriaSkills = args.criteriaSkills ?? { mustHaveSkills: [], niceToHaveSkills: [] };
  const matchedRequest = args.hireRequests.find((request) =>
    includesEither(request.position_title, args.jobTitle),
  );
  const teamName = matchedRequest?.business_unit?.trim() || null;
  const teamSkills = teamName
    ? args.skillsMatrix.filter((skill) => includesEither(skill.team_name, teamName))
    : [];

  if (!matchedRequest && teamSkills.length === 0) {
    return {
      position: args.jobTitle,
      teamName: null,
      skillsGap: [],
      summary: 'No matching hire request or team skills matrix was found for this position.',
      recommendations: [],
      structuredRecommendations: [],
      dataStatus: 'no_matching_team_data',
      source: args.source,
    };
  }

  const rawGapSummary = matchedRequest?.team_skill_gap_summary?.trim() || '';
  const weakSkills = teamSkills
    .filter((skill) => /^(basic|none)$/i.test(skill.proficiency_level?.trim() || ''))
    .map((skill) => compactSkill(skill.skill))
    .filter((skill): skill is string => Boolean(skill));
  const allMatrixSkills = args.skillsMatrix
    .map((skill) => skill.skill?.trim())
    .filter((skill): skill is string => Boolean(skill));
  const extractedGaps = extractSkillsFromSummary(rawGapSummary, allMatrixSkills);
  const skillsGap = Array.from(
    new Set([...extractedGaps, ...weakSkills].map((skill) => getCanonicalSkillName(skill))),
  );

  if (skillsGap.length === 0) {
    const hasEvidence = Boolean(matchedRequest) && teamSkills.length > 0;
    return {
      position: matchedRequest?.position_title?.trim() || args.jobTitle,
      teamName,
      skillsGap: [],
      summary: hasEvidence
        ? 'The linked hire request and team skills matrix do not record a skill gap for this position.'
        : 'Recruitment data exists, but there is not enough matching team matrix data to conclude a team skill gap.',
      recommendations: [],
      structuredRecommendations: [],
      dataStatus: hasEvidence ? 'no_gap_detected' : 'no_matching_team_data',
      source: args.source,
    };
  }

  const structuredRecommendations = buildStructuredRecommendations({
    uniqueGaps: skillsGap,
    weakSkills,
    extractedGaps,
    teamName,
    criteriaSkills,
  });

  return {
    position: matchedRequest?.position_title?.trim() || args.jobTitle,
    teamName,
    skillsGap,
    summary: rawGapSummary || `The team skills matrix records ${skillsGap.length} skill gap(s).`,
    recommendations: structuredRecommendations.map((gap) => buildRecommendationText(gap, teamName)),
    structuredRecommendations,
    dataStatus: 'gaps_found',
    source: args.source,
  };
}

function unavailable(jobTitle: string): SkillGapInfo {
  return {
    position: jobTitle,
    teamName: null,
    skillsGap: [],
    summary: 'Hire request and team skills matrix data sources are currently unavailable.',
    recommendations: [],
    structuredRecommendations: [],
    dataStatus: 'source_unavailable',
    source: 'none',
  };
}

async function loadCriteriaSkills(criteriaId: string | undefined): Promise<CriteriaSkills> {
  if (!criteriaId) return { mustHaveSkills: [], niceToHaveSkills: [] };

  try {
    const db = smartrecruitDb();
    const [crit] = await db.select().from(criteria).where(eq(criteria.id, criteriaId)).limit(1);
    return {
      mustHaveSkills: crit?.must_have_skills ?? [],
      niceToHaveSkills: crit?.nice_to_have_skills ?? [],
    };
  } catch (error) {
    console.warn('Failed to load criteria while analyzing skill gaps:', error);
    return { mustHaveSkills: [], niceToHaveSkills: [] };
  }
}

export async function analyzeSkillGaps(
  jobTitle: string,
  tenantId: string,
  criteriaId?: string,
): Promise<SkillGapInfo> {
  const db = smartrecruitDb();
  const criteriaSkills = await loadCriteriaSkills(criteriaId);

  try {
    const [dbHireRequests, dbSkillsMatrix] = await Promise.all([
      db.select().from(teamHireRequests).where(eq(teamHireRequests.tenant_id, tenantId)),
      db.select().from(teamSkillsMatrix).where(eq(teamSkillsMatrix.tenant_id, tenantId)),
    ]);

    if (dbHireRequests.length > 0 || dbSkillsMatrix.length > 0) {
      const databaseResult = analyzeSkillGapRows({
        jobTitle,
        hireRequests: dbHireRequests,
        skillsMatrix: dbSkillsMatrix,
        source: 'database',
        criteriaSkills,
      });
      if (databaseResult.dataStatus !== 'no_matching_team_data') return databaseResult;
    }
  } catch (error) {
    console.warn('Failed to query skill gaps from database; trying workbook fallback:', error);
  }

  const filePath = path.resolve(repoRoot, 'mock-data/03_ta_hire_request_jd_generation.xlsx');
  if (!existsSync(filePath)) return unavailable(jobTitle);

  try {
    const workbook = xlsx.readFile(filePath);
    const skillMatrixSheet = workbook.Sheets.DS04_Team_Skills_Matrix;
    const hireRequestSheet = workbook.Sheets.DS06_Hire_Request;
    if (!skillMatrixSheet && !hireRequestSheet) return unavailable(jobTitle);

    return analyzeSkillGapRows({
      jobTitle,
      hireRequests: hireRequestSheet
        ? xlsx.utils.sheet_to_json<HireRequestRow>(hireRequestSheet)
        : [],
      skillsMatrix: skillMatrixSheet
        ? xlsx.utils.sheet_to_json<SkillMatrixRow>(skillMatrixSheet)
        : [],
      source: 'workbook',
      criteriaSkills,
    });
  } catch (error) {
    console.error('Failed to parse skill-gap workbook:', error);
    return unavailable(jobTitle);
  }
}
