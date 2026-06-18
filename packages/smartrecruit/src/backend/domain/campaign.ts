import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { getPool } from '@seta/shared-db';
import { and, eq, inArray } from 'drizzle-orm';
import { smartrecruitDb } from '../db/client.ts';
import { campaignCandidates, campaigns, candidates, outreachDrafts } from '../db/schema.ts';
import type { SmartrecruitCandidateInput } from '../workflows/smartrecruit-workflow.ts';

export type CampaignStatus =
  | 'queued'
  | 'awaiting_criteria'
  | 'screening'
  | 'screening_completed'
  | 'drafting'
  | 'awaiting_outreach_approval'
  | 'sending'
  | 'completed'
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
  cvs: SmartrecruitCandidateInput[];
  templateId?: string;
  session: SessionScope;
}

export interface CampaignView {
  campaign: typeof campaigns.$inferSelect;
  candidates: Array<{
    campaignCandidate: typeof campaignCandidates.$inferSelect;
    candidate: typeof candidates.$inferSelect | null;
    draft: typeof outreachDrafts.$inferSelect | null;
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

  const candidateById = new Map(candidateRows.map((row) => [row.id, row]));
  const draftById = new Map(draftRows.map((row) => [row.id, row]));

  return {
    campaign,
    candidates: campaignRows.map((row) => ({
      campaignCandidate: row,
      candidate: candidateById.get(row.candidate_id) ?? null,
      draft: row.draft_id ? (draftById.get(row.draft_id) ?? null) : null,
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
      ...(args.status === 'completed' || args.status === 'failed' || args.status === 'canceled'
        ? { completed_at: new Date() }
        : {}),
      updated_at: new Date(),
    })
    .where(and(eq(campaigns.id, args.campaignId), eq(campaigns.tenant_id, args.tenantId)));
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
