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
    // If the gap skill is in niceToHaveSkills, promote it to mustHaveSkills
    const niceIndex = promotedNiceToHave.findIndex((s) => areSkillsMatching(s, gap));
    if (niceIndex !== -1) {
      const skillName = promotedNiceToHave[niceIndex];
      if (skillName) {
        const mustHas = promotedMustHave.some((s) => areSkillsMatching(s, gap));
        if (!mustHas) {
          promotedMustHave.push(skillName);
        }
        promotedNiceToHave.splice(niceIndex, 1);
      }
    }
  }

  return { promotedMustHave, promotedNiceToHave };
}

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
  teamName: string;
  skillsGap: string[];
  summary: string;
  recommendations: string[];
  structuredRecommendations: SkillGapRecommendation[];
}

interface SkillMatrixRow {
  team_name?: string;
  proficiency_level?: string;
  skill?: string;
}

interface HireRequestRow {
  position_title?: string;
  team_skill_gap_summary?: string;
  business_unit?: string;
}

function extractSkillsFromSummary(summary: string, allSkills: string[]): string[] {
  if (!summary) return [];
  const found = new Set<string>();

  const candidateSkills = Array.from(
    new Set([...allSkills, ...Object.keys(SKILL_ALIASES), ...Object.values(SKILL_ALIASES)]),
  );

  for (const skill of candidateSkills) {
    const escaped = skill.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    let regex: RegExp;
    if (/^[a-zA-Z0-9_]+$/.test(skill)) {
      regex = new RegExp(`\\b${escaped}\\b`, 'i');
    } else {
      regex = new RegExp(escaped, 'i');
    }

    if (regex.test(summary)) {
      found.add(getCanonicalSkillName(skill));
    }
  }
  return Array.from(found);
}

export async function analyzeSkillGaps(
  jobTitle: string,
  tenantId: string,
  criteriaId?: string,
): Promise<SkillGapInfo> {
  const db = smartrecruitDb();

  // Load criteria if criteriaId is supplied
  let mustHaveSkills: string[] = [];
  let niceToHaveSkills: string[] = [];
  if (criteriaId) {
    try {
      const [crit] = await db.select().from(criteria).where(eq(criteria.id, criteriaId)).limit(1);
      if (crit) {
        mustHaveSkills = crit.must_have_skills || [];
        niceToHaveSkills = crit.nice_to_have_skills || [];
      }
    } catch (err) {
      console.warn('Failed to load criteria in analyzeSkillGaps:', err);
    }
  }

  try {
    // 1. Attempt to load from PostgreSQL Database first
    const dbHireRequests = await db
      .select()
      .from(teamHireRequests)
      .where(eq(teamHireRequests.tenant_id, tenantId));

    const dbSkillsMatrix = await db
      .select()
      .from(teamSkillsMatrix)
      .where(eq(teamSkillsMatrix.tenant_id, tenantId));

    if (dbHireRequests.length > 0 || dbSkillsMatrix.length > 0) {
      // Find hire request matching position
      const matchedRequest = dbHireRequests.find(
        (r) =>
          r.position_title?.toLowerCase().includes(jobTitle.toLowerCase()) ||
          jobTitle.toLowerCase().includes(r.position_title?.toLowerCase() || ''),
      );

      const rawGapSummary = matchedRequest?.team_skill_gap_summary || '';
      const teamName = matchedRequest?.business_unit || 'Platform Team';

      // Find team skills from matrix
      const teamSkills = dbSkillsMatrix.filter(
        (s) =>
          s.team_name?.toLowerCase().includes(teamName.toLowerCase()) ||
          teamName.toLowerCase().includes(s.team_name?.toLowerCase() || ''),
      );

      // Identify weak or missing skills (Intermediate, Basic, or None)
      const weakSkills = teamSkills
        .filter((s) => s.proficiency_level === 'Basic' || s.proficiency_level === 'None')
        .map((s) => getCanonicalSkillName(s.skill));

      // Extract skills mentioned in the raw gap summary
      const allMatrixSkills = dbSkillsMatrix.map((s) => s.skill);
      const extractedGaps = extractSkillsFromSummary(rawGapSummary, allMatrixSkills);

      // Merge gaps
      const uniqueGaps = Array.from(
        new Set([...extractedGaps, ...weakSkills].map(getCanonicalSkillName)),
      );

      // Generate structured recommendations
      const structuredRecommendations: SkillGapRecommendation[] = uniqueGaps.map((skill) => {
        const isWeak = weakSkills.some((s) => areSkillsMatching(s, skill));
        const isExtracted = extractedGaps.some((s) => areSkillsMatching(s, skill));

        let source: 'DS04_Team_Skills_Matrix' | 'DS06_Hire_Request' | 'both' =
          'DS04_Team_Skills_Matrix';
        let reason = `Team proficiency is low or missing in the skills matrix (${teamName})`;
        let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';

        if (isWeak && isExtracted) {
          source = 'both';
          reason = `Team proficiency is low and identified in the hire request (${teamName})`;
          priority = 'critical';
        } else if (isExtracted) {
          source = 'both'; // Keep as both or DS06_Hire_Request, let's use both/hire request
          source = 'DS06_Hire_Request';
          reason = `Explicitly requested to fill team skill gap in hire request (${teamName})`;
          priority = 'high';
        }

        const isApplied =
          mustHaveSkills.some((s) => areSkillsMatching(s, skill)) ||
          niceToHaveSkills.some((s) => areSkillsMatching(s, skill));

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
          applied: isApplied,
        };
      });

      // Generate standard recommendations list (in English)
      const recommendations = structuredRecommendations.map((gap) => {
        if (gap.applied) {
          return `Applied: Prioritized ${gap.skill} because ${gap.reason.toLowerCase()}`;
        }
        if (gap.recommendedAction === 'promote_to_must_have') {
          return `Recommend: Add ${gap.skill} as a Must-Have skill to address a critical team gap in ${teamName}.`;
        }
        if (gap.recommendedAction === 'increase_nice_to_have_weight') {
          return `Recommend: Add ${gap.skill} as a Nice-to-Have skill or increase its weight to address a high-priority gap in ${teamName}.`;
        }
        return `Note: Consider candidate's experience with ${gap.skill} to support ${teamName}.`;
      });

      if (recommendations.length === 0) {
        recommendations.push(
          'The current team has sufficient basic skills; focus on years of experience.',
        );
      }

      return {
        position: matchedRequest?.position_title || jobTitle,
        teamName,
        skillsGap: uniqueGaps,
        summary:
          rawGapSummary ||
          'No pre-defined team skill gap found for this position. The system automatically analyzed the skills matrix.',
        recommendations,
        structuredRecommendations,
      };
    }
  } catch (dbErr) {
    console.warn('Failed to query skill gaps from Database, falling back to Excel:', dbErr);
  }

  // 2. Fallback to Dynamic Excel Reading
  const filePath = path.resolve(repoRoot, 'mock-data/03_ta_hire_request_jd_generation.xlsx');
  if (!existsSync(filePath)) {
    return {
      position: jobTitle,
      teamName: 'Platform Team',
      skillsGap: ['Kafka', 'Redis'],
      summary:
        'Error reading mock data file. Default recommendations applied based on Project Alpha requirements.',
      recommendations: [
        'Recommend: Add Kafka as a Must-Have skill to address a critical team gap in Platform Team.',
        'Recommend: Add Redis as a Nice-to-Have skill or increase its weight to address a high-priority gap in Platform Team.',
      ],
      structuredRecommendations: [
        {
          skill: 'Kafka',
          source: 'both',
          reason: 'Team proficiency is low and identified in the hire request (Platform Team)',
          priority: 'critical',
          recommendedAction: 'promote_to_must_have',
          applied:
            mustHaveSkills.some((s) => areSkillsMatching(s, 'Kafka')) ||
            niceToHaveSkills.some((s) => areSkillsMatching(s, 'Kafka')),
        },
        {
          skill: 'Redis',
          source: 'DS06_Hire_Request',
          reason: 'Explicitly requested to fill team skill gap in hire request (Platform Team)',
          priority: 'high',
          recommendedAction: 'increase_nice_to_have_weight',
          applied:
            mustHaveSkills.some((s) => areSkillsMatching(s, 'Redis')) ||
            niceToHaveSkills.some((s) => areSkillsMatching(s, 'Redis')),
        },
      ],
    };
  }

  try {
    const workbook = xlsx.readFile(filePath);

    // Read Team Skills Matrix
    const skillMatrixSheet = workbook.Sheets.DS04_Team_Skills_Matrix;
    const skillsMatrix = skillMatrixSheet
      ? xlsx.utils.sheet_to_json<SkillMatrixRow>(skillMatrixSheet)
      : [];

    // Read Hire Requests to extract raw gap summaries
    const hireRequestSheet = workbook.Sheets.DS06_Hire_Request;
    const hireRequests = hireRequestSheet
      ? xlsx.utils.sheet_to_json<HireRequestRow>(hireRequestSheet)
      : [];

    // Find hire request matching position
    const matchedRequest = hireRequests.find(
      (r) =>
        r.position_title?.toLowerCase().includes(jobTitle.toLowerCase()) ||
        jobTitle.toLowerCase().includes(r.position_title?.toLowerCase() || ''),
    );

    const rawGapSummary = matchedRequest?.team_skill_gap_summary || '';
    const teamName = matchedRequest?.business_unit || 'Platform Team';

    // Find team skills from matrix
    const teamSkills = skillsMatrix.filter(
      (s) =>
        s.team_name?.toLowerCase().includes(teamName.toLowerCase()) ||
        teamName.toLowerCase().includes(s.team_name?.toLowerCase() || ''),
    );

    // Identify weak or missing skills
    const weakSkills = teamSkills
      .filter((s) => s.proficiency_level === 'Basic' || s.proficiency_level === 'None')
      .map((s) => getCanonicalSkillName(s.skill as string));

    // Extract skills mentioned in the raw gap summary
    const allMatrixSkills = skillsMatrix.map((s) => s.skill as string);
    const extractedGaps = extractSkillsFromSummary(rawGapSummary, allMatrixSkills);

    // Merge gaps
    const uniqueGaps = Array.from(
      new Set([...extractedGaps, ...weakSkills].map(getCanonicalSkillName)),
    );

    // Generate structured recommendations
    const structuredRecommendations: SkillGapRecommendation[] = uniqueGaps.map((skill) => {
      const isWeak = weakSkills.some((s) => areSkillsMatching(s, skill));
      const isExtracted = extractedGaps.some((s) => areSkillsMatching(s, skill));

      let source: 'DS04_Team_Skills_Matrix' | 'DS06_Hire_Request' | 'both' =
        'DS04_Team_Skills_Matrix';
      let reason = `Team proficiency is low or missing in the skills matrix (${teamName})`;
      let priority: 'critical' | 'high' | 'medium' | 'low' = 'medium';

      if (isWeak && isExtracted) {
        source = 'both';
        reason = `Team proficiency is low and identified in the hire request (${teamName})`;
        priority = 'critical';
      } else if (isExtracted) {
        source = 'DS06_Hire_Request';
        reason = `Explicitly requested to fill team skill gap in hire request (${teamName})`;
        priority = 'high';
      }

      const isApplied =
        mustHaveSkills.some((s) => areSkillsMatching(s, skill)) ||
        niceToHaveSkills.some((s) => areSkillsMatching(s, skill));

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
        applied: isApplied,
      };
    });

    // Generate standard recommendations list (in English)
    const recommendations = structuredRecommendations.map((gap) => {
      if (gap.applied) {
        return `Applied: Prioritized ${gap.skill} because ${gap.reason.toLowerCase()}`;
      }
      if (gap.recommendedAction === 'promote_to_must_have') {
        return `Recommend: Add ${gap.skill} as a Must-Have skill to address a critical team gap in ${teamName}.`;
      }
      if (gap.recommendedAction === 'increase_nice_to_have_weight') {
        return `Recommend: Add ${gap.skill} as a Nice-to-Have skill or increase its weight to address a high-priority gap in ${teamName}.`;
      }
      return `Note: Consider candidate's experience with ${gap.skill} to support ${teamName}.`;
    });

    if (recommendations.length === 0) {
      recommendations.push(
        'The current team has sufficient basic skills; focus on years of experience.',
      );
    }

    return {
      position: matchedRequest?.position_title || jobTitle,
      teamName,
      skillsGap: uniqueGaps,
      summary:
        rawGapSummary ||
        'No pre-defined team skill gap found for this position. The system automatically analyzed the skills matrix.',
      recommendations,
      structuredRecommendations,
    };
  } catch (err) {
    console.error('Failed to parse skills gap from Excel:', err);
    return {
      position: jobTitle,
      teamName: 'Platform Team',
      skillsGap: ['Kafka', 'Redis'],
      summary:
        'Error reading mock data file. Default recommendations applied based on Project Alpha requirements.',
      recommendations: [
        'Recommend: Add Kafka as a Must-Have skill to address a critical team gap in Platform Team.',
        'Recommend: Add Redis as a Nice-to-Have skill or increase its weight to address a high-priority gap in Platform Team.',
      ],
      structuredRecommendations: [
        {
          skill: 'Kafka',
          source: 'both',
          reason: 'Team proficiency is low and identified in the hire request (Platform Team)',
          priority: 'critical',
          recommendedAction: 'promote_to_must_have',
          applied:
            mustHaveSkills.some((s) => areSkillsMatching(s, 'Kafka')) ||
            niceToHaveSkills.some((s) => areSkillsMatching(s, 'Kafka')),
        },
        {
          skill: 'Redis',
          source: 'DS06_Hire_Request',
          reason: 'Explicitly requested to fill team skill gap in hire request (Platform Team)',
          priority: 'high',
          recommendedAction: 'increase_nice_to_have_weight',
          applied:
            mustHaveSkills.some((s) => areSkillsMatching(s, 'Redis')) ||
            niceToHaveSkills.some((s) => areSkillsMatching(s, 'Redis')),
        },
      ],
    };
  }
}
