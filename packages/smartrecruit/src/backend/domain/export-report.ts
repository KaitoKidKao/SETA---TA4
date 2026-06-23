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

  let markdown = `# Shortlist Report\n`;
  markdown += `**Hiring position:** ${campaign.job_title}\n`;
  markdown += `**Campaign ID:** \`${campaign.id}\`\n`;
  markdown += `**Generated at:** ${new Date().toLocaleDateString('en-US')}\n\n`;

  if (opts.recruiterNote) {
    markdown += `### Recruiter Note\n`;
    markdown += `${opts.recruiterNote}\n\n`;
  }

  markdown += `## Recommended Candidates (${shortlistedCandidates.length})\n\n`;

  if (shortlistedCandidates.length === 0) {
    markdown += `*No candidates met the shortlist threshold for this campaign.*\n`;
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

    markdown += `### ${i + 1}. ${cand.display_name} - Fit score: **${fitScore}%** ${isOverridden ? '*(reviewed by Recruiter)*' : ''}\n`;
    markdown += `- **Email:** ${cand.email}\n`;
    markdown += `- **Phone:** ${cand.phone || 'N/A'}\n`;
    markdown += `- **Years of experience:** ${cand.years_of_experience !== null ? `${cand.years_of_experience} years` : 'N/A'}\n`;
    markdown += `- **English level:** ${cand.english_level || 'N/A'}\n`;

    const report = cc.screening_report as {
      pros?: string[];
      gaps?: string[];
      yoeExplanation?: string;
    } | null;

    if (report) {
      if (report.pros && report.pros.length > 0) {
        markdown += `- **Strengths:**\n`;
        for (const pro of report.pros) {
          markdown += `  * ${pro}\n`;
        }
      }
      if (report.gaps && report.gaps.length > 0) {
        markdown += `- **Gaps:**\n`;
        for (const gap of report.gaps) {
          markdown += `  * ${gap}\n`;
        }
      }
      if (report.yoeExplanation) {
        markdown += `- **Experience details:** ${report.yoeExplanation}\n`;
      }
    }

    if (override) {
      markdown += `- **Recruiter review reason:** *"${override.reason}"*\n`;
    }

    markdown += `\n---\n\n`;
  }

  // Add SLA Section
  markdown += `## Feedback SLA Tracking\n`;
  markdown += `> **Note for Hiring Managers:** Please submit shortlist feedback within **48 hours** of receiving this report so the hiring process stays on schedule.\n`;

  return markdown;
}
