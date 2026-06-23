import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import xlsx from 'xlsx';
import { smartrecruitDb } from '../db/client.ts';
import { teamHireRequests, teamSkillsMatrix } from '../db/schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../..');

export type SkillGapDataStatus =
  | 'gaps_found'
  | 'no_gap_detected'
  | 'no_matching_team_data'
  | 'source_unavailable';

export type SkillGapSource = 'database' | 'workbook' | 'none';

export interface SkillGapInfo {
  position: string;
  teamName: string | null;
  skillsGap: string[];
  summary: string;
  recommendations: string[];
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

function includesEither(left: string | null | undefined, right: string): boolean {
  const normalizedLeft = left?.trim().toLowerCase();
  const normalizedRight = right.trim().toLowerCase();
  if (!normalizedLeft || !normalizedRight) return false;
  return normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft);
}

function extractKnownGaps(summary: string): string[] {
  const patterns: Array<[RegExp, string]> = [
    [/\bkafka\b/i, 'Kafka'],
    [/\bredis\b/i, 'Redis'],
    [/\bdocker\b/i, 'Docker'],
    [/\b(kubernetes|k8s)\b/i, 'Kubernetes'],
    [/\bplaywright\b/i, 'Playwright'],
    [/\bselenium\b/i, 'Selenium'],
    [/\btypescript\b/i, 'TypeScript'],
  ];
  return patterns.filter(([pattern]) => pattern.test(summary)).map(([, skill]) => skill);
}

export function analyzeSkillGapRows(args: {
  jobTitle: string;
  hireRequests: HireRequestRow[];
  skillsMatrix: SkillMatrixRow[];
  source: Exclude<SkillGapSource, 'none'>;
}): SkillGapInfo {
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
      summary: 'Không tìm thấy hire request hoặc ma trận kỹ năng phù hợp với vị trí này.',
      recommendations: [],
      dataStatus: 'no_matching_team_data',
      source: args.source,
    };
  }

  const rawGapSummary = matchedRequest?.team_skill_gap_summary?.trim() || '';
  const weakSkills = teamSkills
    .filter((skill) => /^(basic|none)$/i.test(skill.proficiency_level?.trim() || ''))
    .map((skill) => skill.skill?.trim())
    .filter((skill): skill is string => Boolean(skill));
  const skillsGap = [...new Set([...extractKnownGaps(rawGapSummary), ...weakSkills])];

  if (skillsGap.length === 0) {
    const hasEvidence = Boolean(matchedRequest) && teamSkills.length > 0;
    return {
      position: matchedRequest?.position_title?.trim() || args.jobTitle,
      teamName,
      skillsGap: [],
      summary: hasEvidence
        ? 'Hire request và ma trận kỹ năng không ghi nhận khoảng trống kỹ năng cho vị trí này.'
        : 'Có dữ liệu tuyển dụng nhưng chưa đủ ma trận kỹ năng để kết luận về khoảng trống của đội ngũ.',
      recommendations: [],
      dataStatus: hasEvidence ? 'no_gap_detected' : 'no_matching_team_data',
      source: args.source,
    };
  }

  return {
    position: matchedRequest?.position_title?.trim() || args.jobTitle,
    teamName,
    skillsGap,
    summary: rawGapSummary || `Ma trận kỹ năng ghi nhận ${skillsGap.length} kỹ năng cần bổ sung.`,
    recommendations: skillsGap.map(
      (skill) =>
        `Ưu tiên ứng viên có bằng chứng kinh nghiệm thực tế với ${skill} để bù đắp khoảng trống của ${teamName ?? 'đội ngũ'}.`,
    ),
    dataStatus: 'gaps_found',
    source: args.source,
  };
}

function unavailable(jobTitle: string): SkillGapInfo {
  return {
    position: jobTitle,
    teamName: null,
    skillsGap: [],
    summary: 'Nguồn dữ liệu hire request và ma trận kỹ năng hiện không khả dụng.',
    recommendations: [],
    dataStatus: 'source_unavailable',
    source: 'none',
  };
}

export async function analyzeSkillGaps(jobTitle: string, tenantId: string): Promise<SkillGapInfo> {
  const db = smartrecruitDb();

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
    });
  } catch (error) {
    console.error('Failed to parse skill-gap workbook:', error);
    return unavailable(jobTitle);
  }
}
