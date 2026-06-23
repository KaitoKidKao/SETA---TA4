import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { getPool } from '@seta/shared-db';
import { and, eq, gte, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { smartrecruitDb } from '../db/client.ts';
import {
  campaignAiUsage,
  campaignCandidates,
  campaigns,
  candidates,
  interactionHistories,
  outreachDrafts,
} from '../db/schema.ts';

export const SmartrecruitCandidateInputSchema = z.object({
  candidateName: z.string(),
  candidateEmail: z.string().email(),
  candidatePhone: z.string().optional(),
  cvPath: z.string().optional(),
  cvText: z.string(),
});
export type SmartrecruitCandidateInput = z.infer<typeof SmartrecruitCandidateInputSchema>;

export type CampaignStatus =
  | 'queued'
  | 'awaiting_criteria'
  | 'screening'
  | 'screening_completed'
  | 'drafting'
  | 'awaiting_outreach_approval'
  | 'sending'
  | 'completed'
  | 'completed_with_errors'
  | 'failed'
  | 'canceled';

export type CampaignCandidateStatus =
  | 'queued'
  | 'screening'
  | 'screened'
  | 'shortlisted'
  | 'screening_failed'
  | 'drafting'
  | 'drafted'
  | 'draft_failed'
  | 'sending'
  | 'sent'
  | 'send_failed'
  | 'rejected';

export interface CreateCampaignInput {
  jobTitle: string;
  jdText: string;
  cvs: Array<{
    candidateName: string;
    candidateEmail: string;
    candidatePhone?: string;
    cvPath?: string;
    cvText: string;
  }>;
  templateId?: string;
  session: SessionScope;
}

export interface CampaignView {
  campaign: typeof campaigns.$inferSelect;
  candidates: Array<{
    campaignCandidate: typeof campaignCandidates.$inferSelect & {
      effective_fit_score: number | null;
    };
    candidate: typeof candidates.$inferSelect | null;
    draft: typeof outreachDrafts.$inferSelect | null;
    hasRecentOutreach?: boolean;
  }>;
}

const SCREENED_STATUSES = new Set<CampaignCandidateStatus>([
  'screened',
  'shortlisted',
  'drafting',
  'drafted',
  'draft_failed',
  'sending',
  'sent',
  'send_failed',
]);
const SHORTLISTED_STATUSES = new Set<CampaignCandidateStatus>([
  'shortlisted',
  'drafting',
  'drafted',
  'draft_failed',
  'sending',
  'sent',
  'send_failed',
]);
const FAILED_STATUSES = new Set<CampaignCandidateStatus>([
  'screening_failed',
  'draft_failed',
  'send_failed',
]);
const DRAFTED_STATUSES = new Set<CampaignCandidateStatus>([
  'drafted',
  'sending',
  'sent',
  'send_failed',
]);
const CANCELABLE_CANDIDATE_STATUSES: CampaignCandidateStatus[] = [
  'queued',
  'screening',
  'screened',
  'shortlisted',
  'screening_failed',
  'drafting',
  'drafted',
  'draft_failed',
  'sending',
  'send_failed',
];

export async function createSmartrecruitCampaign(
  input: CreateCampaignInput,
): Promise<CampaignView> {
  let campaignId!: string;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      campaignId = crypto.randomUUID();
      await tx.insert(campaigns).values({
        id: campaignId,
        tenant_id: input.session.tenant_id,
        job_title: input.jobTitle,
        jd_text: input.jdText,
        template_id: input.templateId ?? null,
        orchestration_version: 2,
        status: 'queued',
        total_candidates: input.cvs.length,
        created_by: input.session.user_id,
      });

      for (const cv of input.cvs) {
        const candidateId = crypto.randomUUID();
        await tx.insert(candidates).values({
          id: candidateId,
          tenant_id: input.session.tenant_id,
          display_name: cv.candidateName,
          email: cv.candidateEmail,
          phone: cv.candidatePhone ?? null,
          cv_path: cv.cvPath ?? null,
          cv_text: cv.cvText,
          status: 'applied',
        });
        await tx.insert(campaignCandidates).values({
          id: crypto.randomUUID(),
          tenant_id: input.session.tenant_id,
          campaign_id: campaignId,
          candidate_id: candidateId,
          source: 'uploaded',
          status: 'queued',
        });
      }
    },
  );

  const view = await getCampaignView({
    campaignId,
    tenantId: input.session.tenant_id,
  });
  if (!view) throw new Error('Campaign was created but could not be loaded.');
  return view;
}

export async function getCampaignView(args: {
  campaignId: string;
  tenantId: string;
}): Promise<CampaignView | null> {
  const db = smartrecruitDb();
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)))
    .limit(1);

  if (!campaign) return null;

  const campaignRows = await db
    .select()
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.campaign_id, args.campaignId),
        eq(campaignCandidates.tenant_id, args.tenantId),
      ),
    );

  const candidateIds = campaignRows.map((row) => row.candidate_id);
  const draftIds = campaignRows.map((row) => row.draft_id).filter((id): id is string => !!id);
  const candidateRows =
    candidateIds.length > 0
      ? await db
          .select()
          .from(candidates)
          .where(and(eq(candidates.tenant_id, args.tenantId), inArray(candidates.id, candidateIds)))
      : [];
  const draftRows =
    draftIds.length > 0
      ? await db
          .select()
          .from(outreachDrafts)
          .where(
            and(eq(outreachDrafts.tenant_id, args.tenantId), inArray(outreachDrafts.id, draftIds)),
          )
      : [];

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recentOutreaches =
    candidateIds.length > 0
      ? await db
          .select({ candidate_id: interactionHistories.candidate_id })
          .from(interactionHistories)
          .where(
            and(
              eq(interactionHistories.tenant_id, args.tenantId),
              inArray(interactionHistories.candidate_id, candidateIds),
              gte(interactionHistories.sent_at, thirtyDaysAgo),
            ),
          )
      : [];

  const recentOutreachSet = new Set(recentOutreaches.map((row) => row.candidate_id));

  const candidateById = new Map(candidateRows.map((row) => [row.id, row]));
  const draftById = new Map(draftRows.map((row) => [row.id, row]));

  return {
    campaign,
    candidates: campaignRows.map((row) => ({
      campaignCandidate: {
        ...row,
        effective_fit_score: row.reviewed_fit_score ?? row.fit_score,
      },
      candidate: candidateById.get(row.candidate_id) ?? null,
      draft: row.draft_id ? (draftById.get(row.draft_id) ?? null) : null,
      hasRecentOutreach: recentOutreachSet.has(row.candidate_id),
    })),
  };
}

export async function updateCampaignWorkflowRun(args: {
  campaignId: string;
  tenantId: string;
  workflowRunId: string;
}): Promise<void> {
  const db = smartrecruitDb();
  await db
    .update(campaigns)
    .set({ workflow_run_id: args.workflowRunId, updated_at: new Date() })
    .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)));
}

export async function updateCampaignStatus(args: {
  campaignId: string;
  tenantId: string;
  status: CampaignStatus;
  criteriaId?: string | null;
  errorReason?: string | null;
}): Promise<void> {
  const db = smartrecruitDb();
  await db
    .update(campaigns)
    .set({
      status: args.status,
      ...(args.criteriaId !== undefined ? { criteria_id: args.criteriaId } : {}),
      ...(args.errorReason !== undefined ? { error_reason: args.errorReason } : {}),
      ...(args.status === 'screening' ? { started_at: new Date() } : {}),
      ...(args.status === 'screening' ? { screening_started_at: new Date() } : {}),
      ...(args.status === 'screening_completed' ? { screening_completed_at: new Date() } : {}),
      ...(args.status === 'drafting' ? { drafting_started_at: new Date() } : {}),
      ...(args.status === 'awaiting_outreach_approval'
        ? { drafting_completed_at: new Date() }
        : {}),
      ...(args.status === 'sending' ? { sending_started_at: new Date() } : {}),
      ...(args.status === 'completed' || args.status === 'completed_with_errors'
        ? { sending_completed_at: new Date() }
        : {}),
      ...(args.status === 'completed' ||
      args.status === 'completed_with_errors' ||
      args.status === 'failed' ||
      args.status === 'canceled'
        ? { completed_at: new Date() }
        : {}),
      updated_at: new Date(),
    })
    .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)));
}

export async function cancelSmartrecruitCampaign(args: {
  campaignId: string;
  tenantId: string;
  userId: string;
  reason?: string;
}): Promise<CampaignView | null> {
  const db = smartrecruitDb();
  const [campaign] = await db
    .select({ id: campaigns.id, status: campaigns.status })
    .from(campaigns)
    .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)))
    .limit(1);

  if (!campaign) return null;

  const reason =
    args.reason?.trim() || `Campaign canceled by user ${args.userId} after a bad or stale run.`;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(campaigns)
      .set({
        status: 'canceled',
        error_reason: reason,
        completed_at: now,
        updated_at: now,
      })
      .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)));

    await tx
      .update(campaignCandidates)
      .set({
        status: 'rejected',
        error_reason: reason,
        updated_at: now,
      })
      .where(
        and(
          eq(campaignCandidates.campaign_id, args.campaignId),
          eq(campaignCandidates.tenant_id, args.tenantId),
          inArray(campaignCandidates.status, CANCELABLE_CANDIDATE_STATUSES),
        ),
      );
  });

  await recomputeCampaignCounters({ campaignId: args.campaignId, tenantId: args.tenantId });
  return getCampaignView({ campaignId: args.campaignId, tenantId: args.tenantId });
}

export async function addCandidatesToCampaign(args: {
  campaignId: string;
  tenantId: string;
  candidateIds: string[];
  source: 'suggested' | 'mock_pool' | 'manual';
}): Promise<void> {
  if (args.candidateIds.length === 0) return;
  const db = smartrecruitDb();
  const existing = await db
    .select({ candidate_id: campaignCandidates.candidate_id })
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.tenant_id, args.tenantId),
        eq(campaignCandidates.campaign_id, args.campaignId),
      ),
    );
  const existingIds = new Set(existing.map((row) => row.candidate_id));
  const newIds = args.candidateIds.filter((id) => !existingIds.has(id));
  if (newIds.length === 0) return;

  await db.insert(campaignCandidates).values(
    newIds.map((candidateId) => ({
      id: crypto.randomUUID(),
      tenant_id: args.tenantId,
      campaign_id: args.campaignId,
      candidate_id: candidateId,
      source: args.source,
      status: 'queued' as const,
    })),
  );
  await recomputeCampaignCounters({ campaignId: args.campaignId, tenantId: args.tenantId });
}

export async function recomputeCampaignCounters(args: {
  campaignId: string;
  tenantId: string;
}): Promise<void> {
  const db = smartrecruitDb();
  const rows = await db
    .select({ status: campaignCandidates.status })
    .from(campaignCandidates)
    .where(
      and(
        eq(campaignCandidates.tenant_id, args.tenantId),
        eq(campaignCandidates.campaign_id, args.campaignId),
      ),
    );

  const statuses = rows.map((row) => row.status as CampaignCandidateStatus);
  await db
    .update(campaigns)
    .set({
      total_candidates: statuses.length,
      screened_count: statuses.filter((status) => SCREENED_STATUSES.has(status)).length,
      shortlisted_count: statuses.filter((status) => SHORTLISTED_STATUSES.has(status)).length,
      failed_count: statuses.filter((status) => FAILED_STATUSES.has(status)).length,
      drafted_count: statuses.filter((status) => DRAFTED_STATUSES.has(status)).length,
      sent_count: statuses.filter((status) => status === 'sent').length,
      updated_at: new Date(),
    })
    .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)));
}

export async function enqueueSmartrecruitJob(
  identifier: string,
  payload: Record<string, unknown>,
  spec?: { jobKey?: string; maxAttempts?: number; queueName?: string },
): Promise<void> {
  await getPool('web').query(
    `SELECT graphile_worker.add_job(
       identifier => $1,
       payload => $2::json,
       queue_name => $3,
       max_attempts => $4,
       job_key => $5
     )`,
    [
      identifier,
      JSON.stringify(payload),
      spec?.queueName ?? null,
      spec?.maxAttempts ?? null,
      spec?.jobKey ?? null,
    ],
  );
}

export async function waitForCampaignStatus(args: {
  campaignId: string;
  tenantId: string;
  statuses: CampaignStatus[];
  timeoutMs?: number;
  pollMs?: number;
}): Promise<typeof campaigns.$inferSelect> {
  const timeoutMs = args.timeoutMs ?? 300_000;
  const pollMs = args.pollMs ?? 1_000;
  const deadline = Date.now() + timeoutMs;
  const statusSet = new Set(args.statuses);

  while (Date.now() < deadline) {
    const view = await getCampaignView({ campaignId: args.campaignId, tenantId: args.tenantId });
    if (!view) throw new Error(`Campaign ${args.campaignId} not found.`);
    if (statusSet.has(view.campaign.status as CampaignStatus)) return view.campaign;
    if (view.campaign.status === 'failed' || view.campaign.status === 'canceled') {
      throw new Error(view.campaign.error_reason ?? `Campaign ${view.campaign.status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  throw new Error(`Timed out waiting for campaign ${args.campaignId} status.`);
}

export interface CampaignKPIs {
  timeToScreenSec: number | null;
  shortlistRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  estimatedCostUsd: number;
}

export async function getCampaignKPIs(args: {
  campaignId: string;
  tenantId: string;
  tokenPricing?: {
    inputPricePerMillion: number;
    outputPricePerMillion: number;
  };
}): Promise<CampaignKPIs> {
  const db = smartrecruitDb();
  const [campaign] = await db
    .select()
    .from(campaigns)
    .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)))
    .limit(1);

  if (!campaign) throw new Error('Campaign not found');

  let timeToScreenSec: number | null = null;
  if (campaign.screening_started_at && campaign.screening_completed_at) {
    timeToScreenSec = Math.max(
      0,
      Math.round(
        (campaign.screening_completed_at.getTime() - campaign.screening_started_at.getTime()) /
          1000,
      ),
    );
  }

  const total = campaign.total_candidates || 1;
  const shortlistRate = Math.round(((campaign.shortlisted_count || 0) / total) * 100);

  const usageRows = await db
    .select({
      input_tokens: campaignAiUsage.input_tokens,
      output_tokens: campaignAiUsage.output_tokens,
    })
    .from(campaignAiUsage)
    .where(
      and(
        eq(campaignAiUsage.campaign_id, args.campaignId),
        eq(campaignAiUsage.tenant_id, args.tenantId),
      ),
    );

  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const row of usageRows) {
    totalInputTokens += row.input_tokens || 0;
    totalOutputTokens += row.output_tokens || 0;
  }

  const inputPrice = args.tokenPricing?.inputPricePerMillion ?? 0.15; // default gpt-4o-mini: $0.15 per 1M tokens
  const outputPrice = args.tokenPricing?.outputPricePerMillion ?? 0.6; // default gpt-4o-mini: $0.60 per 1M tokens

  const estimatedCostUsd =
    (totalInputTokens / 1_000_000) * inputPrice + (totalOutputTokens / 1_000_000) * outputPrice;

  return {
    timeToScreenSec,
    shortlistRate,
    totalInputTokens,
    totalOutputTokens,
    estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)),
  };
}
