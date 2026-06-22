import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, desc, eq, max } from 'drizzle-orm';
import PDFDocument from 'pdfkit';
import { smartrecruitDb } from '../db/client.ts';
import { campaignReports, criteria } from '../db/schema.ts';
import { getCampaignView } from './campaign.ts';

interface ReportCandidate {
  id: string;
  name: string;
  email: string;
  aiFitScore: number | null;
  effectiveFitScore: number | null;
  reviewReason: string | null;
  pros: string[];
  gaps: string[];
  scoreBreakdown: Record<string, number>;
  mustHaveMatches: unknown[];
  niceToHaveMatches: unknown[];
  yearsOfExperience: number | null;
  englishLevel: string | null;
}

export interface CampaignReportSnapshot {
  campaign: { id: string; jobTitle: string; status: string; createdAt: string };
  criteria: { id: string | null; mustHaveSkills: string[]; niceToHaveSkills: string[] };
  recruiterNote: string | null;
  candidates: ReportCandidate[];
  generatedAt: string;
}

function markdownFor(snapshot: CampaignReportSnapshot): string {
  const lines = [
    `# BÁO CÁO ỨNG VIÊN RÚT GỌN (SHORTLIST REPORT): ${snapshot.campaign.jobTitle}`,
    '',
    `Chiến dịch ID: \`${snapshot.campaign.id}\``,
    `Trạng thái: ${snapshot.campaign.status}`,
    `Ngày tạo báo cáo: ${new Date(snapshot.generatedAt).toLocaleDateString('vi-VN')}`,
    '',
    '## Tiêu chí Tuyển dụng đã Duyệt',
    `- Kỹ năng yêu cầu (Must-have): ${snapshot.criteria.mustHaveSkills.join(', ') || 'Không có'}`,
    `- Kỹ năng mong muốn (Nice-to-have): ${snapshot.criteria.niceToHaveSkills.join(', ') || 'Không có'}`,
    ...(snapshot.recruiterNote ? ['', '## Ghi chú của Recruiter', snapshot.recruiterNote] : []),
    '',
    '## Danh sách Ứng viên Đề xuất',
  ];
  snapshot.candidates.forEach((candidate, index) => {
    lines.push(
      '',
      `### ${index + 1}. ${candidate.name}`,
      `- Điểm tương thích: **${candidate.effectiveFitScore ?? 'N/A'}%** (AI Score: ${candidate.aiFitScore ?? 'N/A'}%)`,
      `- Email: ${candidate.email}`,
      `- Số năm kinh nghiệm: ${candidate.yearsOfExperience !== null ? `${candidate.yearsOfExperience} năm` : 'N/A'}`,
      `- Trình độ Tiếng Anh: ${candidate.englishLevel || 'N/A'}`,
      `- Điểm mạnh: ${candidate.pros.join('; ') || 'Không ghi nhận'}`,
      `- Điểm yếu / Khoảng trống: ${candidate.gaps.join('; ') || 'Không ghi nhận'}`,
      ...(candidate.reviewReason
        ? [`- Ý kiến & Lý do điều chỉnh của Recruiter: *"${candidate.reviewReason}"*`]
        : []),
    );
  });
  lines.push(
    '',
    '## THEO DÕI PHẢN HỒI (SLA TRACKING)',
    '> **Lưu ý dành cho Hiring Manager:** Vui lòng phản hồi kết quả duyệt shortlist này trong vòng **48 giờ** kể từ khi nhận được báo cáo để đảm bảo tiến độ tuyển dụng.',
  );
  return lines.join('\n');
}

export async function createCampaignReport(args: {
  campaignId: string;
  recruiterNote?: string;
  session: SessionScope;
}) {
  const view = await getCampaignView({
    campaignId: args.campaignId,
    tenantId: args.session.tenant_id,
  });
  if (!view) return null;
  const db = smartrecruitDb();
  const [criterion] = view.campaign.criteria_id
    ? await db
        .select()
        .from(criteria)
        .where(
          and(
            eq(criteria.id, view.campaign.criteria_id),
            eq(criteria.tenant_id, args.session.tenant_id),
          ),
        )
        .limit(1)
    : [];
  const candidates = view.candidates
    .filter(({ campaignCandidate }) =>
      ['shortlisted', 'drafting', 'drafted', 'sending', 'sent', 'send_failed'].includes(
        campaignCandidate.status,
      ),
    )
    .map(({ campaignCandidate, candidate }) => {
      const report = (campaignCandidate.screening_report ?? {}) as {
        pros?: string[];
        gaps?: string[];
        scoreBreakdown?: Record<string, number>;
        mustHaveMatches?: unknown[];
        niceToHaveMatches?: unknown[];
      };
      return {
        id: campaignCandidate.candidate_id,
        name: candidate?.display_name ?? 'Unknown candidate',
        email: candidate?.email ?? '',
        aiFitScore: campaignCandidate.fit_score,
        effectiveFitScore: campaignCandidate.effective_fit_score,
        reviewReason: campaignCandidate.review_reason,
        pros: report.pros ?? [],
        gaps: report.gaps ?? [],
        scoreBreakdown: report.scoreBreakdown ?? {},
        mustHaveMatches: report.mustHaveMatches ?? [],
        niceToHaveMatches: report.niceToHaveMatches ?? [],
        yearsOfExperience: candidate?.years_of_experience ?? null,
        englishLevel: candidate?.english_level ?? null,
      } satisfies ReportCandidate;
    })
    .sort((a, b) => (b.effectiveFitScore ?? -1) - (a.effectiveFitScore ?? -1));
  const snapshot: CampaignReportSnapshot = {
    campaign: {
      id: view.campaign.id,
      jobTitle: view.campaign.job_title,
      status: view.campaign.status,
      createdAt: view.campaign.created_at.toISOString(),
    },
    criteria: {
      id: criterion?.id ?? null,
      mustHaveSkills: criterion?.must_have_skills ?? [],
      niceToHaveSkills: criterion?.nice_to_have_skills ?? [],
    },
    recruiterNote: args.recruiterNote?.trim() || null,
    candidates,
    generatedAt: new Date().toISOString(),
  };
  const markdown = markdownFor(snapshot);
  const contentHash = createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
  const versionRows = await db
    .select({ value: max(campaignReports.version) })
    .from(campaignReports)
    .where(
      and(
        eq(campaignReports.tenant_id, args.session.tenant_id),
        eq(campaignReports.campaign_id, args.campaignId),
      ),
    );
  const latestVersion = versionRows[0]?.value ?? 0;
  const version = (latestVersion ?? 0) + 1;
  let created: typeof campaignReports.$inferSelect | null = null;
  await withEmit(
    { actor: { userId: args.session.user_id, tenantId: args.session.tenant_id } },
    async (tx) => {
      const [row] = await tx
        .insert(campaignReports)
        .values({
          tenant_id: args.session.tenant_id,
          campaign_id: args.campaignId,
          version,
          snapshot,
          markdown,
          content_hash: contentHash,
          recruiter_note: snapshot.recruiterNote,
          created_by: args.session.user_id,
        })
        .returning();
      created = row ?? null;
      if (row)
        await emit({
          tenantId: args.session.tenant_id,
          aggregateType: 'smartrecruit_campaign',
          aggregateId: args.campaignId,
          eventType: 'smartrecruit.campaign.report_generated',
          eventVersion: 1,
          causedByUserId: args.session.user_id,
          payload: { campaignId: args.campaignId, reportId: row.id, version, contentHash },
        });
    },
  );
  return created as typeof campaignReports.$inferSelect | null;
}

export async function listCampaignReports(args: { campaignId: string; tenantId: string }) {
  return smartrecruitDb()
    .select()
    .from(campaignReports)
    .where(
      and(
        eq(campaignReports.tenant_id, args.tenantId),
        eq(campaignReports.campaign_id, args.campaignId),
      ),
    )
    .orderBy(desc(campaignReports.version));
}

export async function getCampaignReport(args: {
  campaignId: string;
  reportId: string;
  tenantId: string;
}) {
  const [row] = await smartrecruitDb()
    .select()
    .from(campaignReports)
    .where(
      and(
        eq(campaignReports.id, args.reportId),
        eq(campaignReports.campaign_id, args.campaignId),
        eq(campaignReports.tenant_id, args.tenantId),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function renderCampaignReportPdf(snapshot: CampaignReportSnapshot): Promise<Buffer> {
  const regular = fileURLToPath(
    import.meta.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-400-normal.woff'),
  );
  const bold = fileURLToPath(
    import.meta.resolve('@fontsource/noto-sans/files/noto-sans-latin-ext-700-normal.woff'),
  );
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: { Title: `Shortlist Report - ${snapshot.campaign.jobTitle}` },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  doc.registerFont('Noto', regular);
  doc.registerFont('NotoBold', bold);
  doc.font('NotoBold').fontSize(18).text(`Shortlist Report: ${snapshot.campaign.jobTitle}`);
  doc
    .moveDown(0.5)
    .font('Noto')
    .fontSize(9)
    .fillColor('#555')
    .text(`Campaign ${snapshot.campaign.id} | ${snapshot.generatedAt}`);
  if (snapshot.recruiterNote)
    doc.moveDown().fillColor('#111').fontSize(10).text(`Recruiter note: ${snapshot.recruiterNote}`);
  for (const [index, candidate] of snapshot.candidates.entries()) {
    doc
      .moveDown()
      .font('NotoBold')
      .fontSize(12)
      .fillColor('#111')
      .text(`${index + 1}. ${candidate.name} - ${candidate.effectiveFitScore ?? 'N/A'}%`);
    doc
      .font('Noto')
      .fontSize(9)
      .text(`AI score: ${candidate.aiFitScore ?? 'N/A'} | ${candidate.email}`);
    doc.text(`Strengths: ${candidate.pros.join('; ') || 'None recorded'}`);
    doc.text(`Gaps: ${candidate.gaps.join('; ') || 'None recorded'}`);
    if (candidate.reviewReason) doc.text(`Recruiter review: ${candidate.reviewReason}`);
  }
  doc.end();
  await new Promise<void>((resolve, reject) => {
    doc.once('end', resolve);
    doc.once('error', reject);
  });
  return Buffer.concat(chunks);
}
