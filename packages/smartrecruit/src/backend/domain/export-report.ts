import { and, eq } from 'drizzle-orm';
import { smartrecruitDb } from '../db/client.ts';
import { recruiterOverrides } from '../db/schema.ts';
import { getCampaignView } from './campaign.ts';

export interface ExportReportOptions {
  campaignId: string;
  tenantId: string;
  recruiterNote?: string;
}

export async function generateShortlistReport(opts: ExportReportOptions): Promise<string> {
  const db = smartrecruitDb();
  const view = await getCampaignView({
    campaignId: opts.campaignId,
    tenantId: opts.tenantId,
  });

  if (!view) {
    throw new Error('Campaign not found');
  }

  const { campaign, candidates } = view;

  // Filter candidates that are shortlisted or have screened successfully, sorted by fit score descending
  const shortlistedCandidates = candidates
    .filter(
      (c) =>
        c.campaignCandidate.status === 'shortlisted' ||
        c.campaignCandidate.status === 'screened' ||
        c.campaignCandidate.status === 'drafted' ||
        c.campaignCandidate.status === 'sent',
    )
    .sort((a, b) => {
      const scoreA = a.campaignCandidate.effective_fit_score ?? 0;
      const scoreB = b.campaignCandidate.effective_fit_score ?? 0;
      return scoreB - scoreA;
    });

  // Fetch overrides for audit/transparency
  const overrides = await db
    .select()
    .from(recruiterOverrides)
    .where(
      and(
        eq(recruiterOverrides.campaign_id, opts.campaignId),
        eq(recruiterOverrides.tenant_id, opts.tenantId),
      ),
    );

  const overridesByCandidate = new Map(overrides.map((o) => [o.candidate_id, o]));

  let markdown = `# BÁO CÁO ỨNG VIÊN RÚT GỌN (SHORTLIST REPORT)\n`;
  markdown += `**Vị trí tuyển dụng:** ${campaign.job_title}\n`;
  markdown += `**Chiến dịch ID:** \`${campaign.id}\`\n`;
  markdown += `**Ngày xuất báo cáo:** ${new Date().toLocaleDateString('vi-VN')}\n\n`;

  if (opts.recruiterNote) {
    markdown += `### Ghi chú của Recruiter\n`;
    markdown += `${opts.recruiterNote}\n\n`;
  }

  markdown += `## DANH SÁCH ỨNG VIÊN ĐỀ XUẤT (${shortlistedCandidates.length})\n\n`;

  if (shortlistedCandidates.length === 0) {
    markdown += `*Không có ứng viên nào đạt tiêu chuẩn shortlist trong chiến dịch này.*\n`;
    return markdown;
  }

  for (let i = 0; i < shortlistedCandidates.length; i++) {
    const item = shortlistedCandidates[i];
    if (!item) continue;
    const cand = item.candidate;
    const cc = item.campaignCandidate;
    if (!cand) continue;

    const override = overridesByCandidate.get(cand.id);
    const fitScore = cc.effective_fit_score ?? 0;
    const isOverridden = cc.reviewed_fit_score !== null;

    markdown += `### ${i + 1}. ${cand.display_name} - Điểm tương thích: **${fitScore}%** ${isOverridden ? '*(Đã được Recruiter điều chỉnh)*' : ''}\n`;
    markdown += `- **Email:** ${cand.email}\n`;
    markdown += `- **Số điện thoại:** ${cand.phone || 'N/A'}\n`;
    markdown += `- **Số năm kinh nghiệm:** ${cand.years_of_experience !== null ? `${cand.years_of_experience} năm` : 'N/A'}\n`;
    markdown += `- **Trình độ Tiếng Anh:** ${cand.english_level || 'N/A'}\n`;

    const report = cc.screening_report as {
      pros?: string[];
      gaps?: string[];
      yoeExplanation?: string;
    } | null;

    if (report) {
      if (report.pros && report.pros.length > 0) {
        markdown += `- **Điểm mạnh (Pros):**\n`;
        for (const pro of report.pros) {
          markdown += `  * ${pro}\n`;
        }
      }
      if (report.gaps && report.gaps.length > 0) {
        markdown += `- **Điểm yếu / Khoảng trống (Gaps):**\n`;
        for (const gap of report.gaps) {
          markdown += `  * ${gap}\n`;
        }
      }
      if (report.yoeExplanation) {
        markdown += `- **Chi tiết kinh nghiệm:** ${report.yoeExplanation}\n`;
      }
    }

    if (override) {
      markdown += `- **Nhận xét & Lý do điều chỉnh điểm:** *"${override.reason}"*\n`;
    }

    markdown += `\n---\n\n`;
  }

  // Add SLA Section
  markdown += `## THEO DÕI PHẢN HỒI (SLA TRACKING)\n`;
  markdown += `> **Lưu ý dành cho Hiring Manager:** Vui lòng phản hồi kết quả duyệt shortlist này trong vòng **48 giờ** kể từ khi nhận được báo cáo để đảm bảo tiến độ tuyển dụng.\n`;

  return markdown;
}
