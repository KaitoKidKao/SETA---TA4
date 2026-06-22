import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import { smartrecruitDb } from '../db/client.ts';
import { campaignAiUsage, campaignDataWarnings, criteria } from '../db/schema.ts';
import { getCampaignView } from './campaign.ts';

export async function getCampaignMetrics(args: { campaignId: string; tenantId: string }) {
  const view = await getCampaignView(args);
  if (!view) return null;
  const usage = await smartrecruitDb()
    .select()
    .from(campaignAiUsage)
    .where(
      and(
        eq(campaignAiUsage.tenant_id, args.tenantId),
        eq(campaignAiUsage.campaign_id, args.campaignId),
      ),
    );
  const campaign = view.campaign;
  const screenMs =
    campaign.screening_started_at && campaign.screening_completed_at
      ? campaign.screening_completed_at.getTime() - campaign.screening_started_at.getTime()
      : null;
  const attempts = view.candidates.reduce(
    (sum, row) =>
      sum +
      row.campaignCandidate.screening_attempts +
      row.campaignCandidate.drafting_attempts +
      row.campaignCandidate.sending_attempts,
    0,
  );
  const totalStageItems =
    campaign.screened_count + campaign.drafted_count + campaign.sent_count + campaign.failed_count;
  return {
    campaignId: campaign.id,
    status: campaign.status,
    timeToScreenMs: screenMs,
    candidatesPerMinute:
      screenMs && screenMs > 0
        ? Math.round((campaign.screened_count / (screenMs / 60_000)) * 10) / 10
        : null,
    shortlistRate:
      campaign.screened_count > 0 ? campaign.shortlisted_count / campaign.screened_count : 0,
    sendSuccessRate: campaign.drafted_count > 0 ? campaign.sent_count / campaign.drafted_count : 0,
    retryCount: Math.max(0, attempts - totalStageItems),
    failureCount: campaign.failed_count,
    ocrFallbackCount: usage.filter((row) => row.ocr_source === 'ocr_fallback').length,
    inputTokens: usage.reduce((sum, row) => sum + (row.input_tokens ?? 0), 0),
    outputTokens: usage.reduce((sum, row) => sum + (row.output_tokens ?? 0), 0),
    aiLatencyMs: usage.reduce((sum, row) => sum + row.latency_ms, 0),
    modelUsage: Object.entries(
      usage.reduce<Record<string, number>>((acc, row) => {
        acc[row.model] = (acc[row.model] ?? 0) + 1;
        return acc;
      }, {}),
    ).map(([model, calls]) => ({ model, calls })),
  };
}

export async function refreshCampaignWarnings(args: { campaignId: string; tenantId: string }) {
  const view = await getCampaignView(args);
  if (!view) return null;
  const db = smartrecruitDb();
  const desired: Array<{
    warningCode: string;
    severity: 'info' | 'warning' | 'error';
    entityType: string;
    entityId: string | null;
    message: string;
  }> = [];
  for (const row of view.candidates) {
    if (!row.candidate?.cv_text?.trim()) {
      desired.push({
        warningCode: 'CV_TEXT_MISSING',
        severity: 'error',
        entityType: 'candidate',
        entityId: row.campaignCandidate.candidate_id,
        message: `Candidate ${row.candidate?.display_name ?? row.campaignCandidate.candidate_id} has no extractable CV text.`,
      });
    }
    if (row.candidate?.email.endsWith('@mock.local')) {
      desired.push({
        warningCode: 'PLACEHOLDER_EMAIL',
        severity: 'warning',
        entityType: 'candidate',
        entityId: row.campaignCandidate.candidate_id,
        message: `Candidate ${row.candidate.display_name} uses a placeholder email.`,
      });
    }
  }
  if (view.campaign.criteria_id) {
    const [criterion] = await db
      .select()
      .from(criteria)
      .where(and(eq(criteria.tenant_id, args.tenantId), eq(criteria.id, view.campaign.criteria_id)))
      .limit(1);
    if (criterion && !criterion.jd_id) {
      desired.push({
        warningCode: 'CRITERIA_JD_ID_MISSING',
        severity: 'warning',
        entityType: 'criteria',
        entityId: criterion.id,
        message: 'The approved criteria has no linked JD identifier.',
      });
    }
  }
  const existing = await db
    .select()
    .from(campaignDataWarnings)
    .where(
      and(
        eq(campaignDataWarnings.tenant_id, args.tenantId),
        eq(campaignDataWarnings.campaign_id, args.campaignId),
      ),
    );
  for (const warning of desired) {
    if (
      existing.some(
        (row) => row.warning_code === warning.warningCode && row.entity_id === warning.entityId,
      )
    )
      continue;
    await db.insert(campaignDataWarnings).values({
      tenant_id: args.tenantId,
      campaign_id: args.campaignId,
      warning_code: warning.warningCode,
      severity: warning.severity,
      entity_type: warning.entityType,
      entity_id: warning.entityId,
      message: warning.message,
    });
  }
  return db
    .select()
    .from(campaignDataWarnings)
    .where(
      and(
        eq(campaignDataWarnings.tenant_id, args.tenantId),
        eq(campaignDataWarnings.campaign_id, args.campaignId),
      ),
    );
}

export async function resolveCampaignWarning(args: {
  campaignId: string;
  warningId: string;
  note?: string;
  session: SessionScope;
}) {
  const [updated] = await smartrecruitDb()
    .update(campaignDataWarnings)
    .set({
      resolved_at: new Date(),
      resolved_by: args.session.user_id,
      resolution_note: args.note ?? null,
    })
    .where(
      and(
        eq(campaignDataWarnings.id, args.warningId),
        eq(campaignDataWarnings.campaign_id, args.campaignId),
        eq(campaignDataWarnings.tenant_id, args.session.tenant_id),
      ),
    )
    .returning();
  return updated ?? null;
}
