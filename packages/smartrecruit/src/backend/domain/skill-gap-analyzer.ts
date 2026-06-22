import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import xlsx from 'xlsx';
import { smartrecruitDb } from '../db/client.ts';
import { teamHireRequests, teamSkillsMatrix } from '../db/schema.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../../../../..');

export interface SkillGapInfo {
  position: string;
  teamName: string;
  skillsGap: string[];
  summary: string;
  recommendations: string[];
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

export async function analyzeSkillGaps(jobTitle: string, tenantId: string): Promise<SkillGapInfo> {
  const db = smartrecruitDb();

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
        .map((s) => s.skill);

      // Extract skills mentioned in the raw gap summary
      const extractedGaps: string[] = [];
      if (rawGapSummary) {
        if (/kafka/i.test(rawGapSummary)) extractedGaps.push('Kafka');
        if (/redis/i.test(rawGapSummary)) extractedGaps.push('Redis');
        if (/docker/i.test(rawGapSummary)) extractedGaps.push('Docker');
        if (/kubernetes/i.test(rawGapSummary) || /k8s/i.test(rawGapSummary))
          extractedGaps.push('Kubernetes');
        if (/playwright/i.test(rawGapSummary)) extractedGaps.push('Playwright');
        if (/selenium/i.test(rawGapSummary)) extractedGaps.push('Selenium');
        if (/typescript/i.test(rawGapSummary)) extractedGaps.push('TypeScript');
      }

      // Merge gaps
      const uniqueGaps = Array.from(new Set([...extractedGaps, ...weakSkills]));

      // Generate recommendations
      const recommendations = uniqueGaps.map(
        (skill) =>
          `Ưu tiên cao ứng viên có kinh nghiệm thực chiến với ${skill} để bù đắp năng lực cho ${teamName}.`,
      );

      if (recommendations.length === 0) {
        recommendations.push(
          'Đội ngũ hiện tại có đủ kỹ năng cơ bản, tập trung đánh giá số năm kinh nghiệm.',
        );
      }

      return {
        position: matchedRequest?.position_title || jobTitle,
        teamName,
        skillsGap: uniqueGaps,
        summary:
          rawGapSummary ||
          'Không tìm thấy thông tin khoảng trống kỹ năng định trước cho vị trí này. Hệ thống tự động phân tích dựa trên ma trận kỹ năng.',
        recommendations,
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
      summary: 'Lỗi đọc tệp dữ liệu mock. Đề xuất mặc định dựa trên yêu cầu dự án Alpha.',
      recommendations: ['Ưu tiên ứng viên có Kafka.', 'Ưu tiên ứng viên có Redis.'],
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
      .map((s) => s.skill as string);

    // Extract skills mentioned in the raw gap summary
    const extractedGaps: string[] = [];
    if (rawGapSummary) {
      if (/kafka/i.test(rawGapSummary)) extractedGaps.push('Kafka');
      if (/redis/i.test(rawGapSummary)) extractedGaps.push('Redis');
      if (/docker/i.test(rawGapSummary)) extractedGaps.push('Docker');
      if (/kubernetes/i.test(rawGapSummary) || /k8s/i.test(rawGapSummary))
        extractedGaps.push('Kubernetes');
      if (/playwright/i.test(rawGapSummary)) extractedGaps.push('Playwright');
      if (/selenium/i.test(rawGapSummary)) extractedGaps.push('Selenium');
      if (/typescript/i.test(rawGapSummary)) extractedGaps.push('TypeScript');
    }

    // Merge gaps
    const uniqueGaps = Array.from(new Set([...extractedGaps, ...weakSkills]));

    // Generate recommendations
    const recommendations = uniqueGaps.map(
      (skill) =>
        `Ưu tiên cao ứng viên có kinh nghiệm thực chiến với ${skill} để bù đắp năng lực cho ${teamName}.`,
    );

    if (recommendations.length === 0) {
      recommendations.push(
        'Đội ngũ hiện tại có đủ kỹ năng cơ bản, tập trung đánh giá số năm kinh nghiệm.',
      );
    }

    return {
      position: matchedRequest?.position_title || jobTitle,
      teamName,
      skillsGap: uniqueGaps,
      summary:
        rawGapSummary ||
        'Không tìm thấy thông tin khoảng trống kỹ năng định trước cho vị trí này. Hệ thống tự động phân tích dựa trên ma trận kỹ năng.',
      recommendations,
    };
  } catch (err) {
    console.error('Failed to parse skills gap from Excel:', err);
    return {
      position: jobTitle,
      teamName: 'Platform Team',
      skillsGap: ['Kafka', 'Redis'],
      summary: 'Lỗi đọc tệp dữ liệu mock. Đề xuất mặc định dựa trên yêu cầu dự án Alpha.',
      recommendations: ['Ưu tiên ứng viên có Kafka.', 'Ưu tiên ứng viên có Redis.'],
    };
  }
}
