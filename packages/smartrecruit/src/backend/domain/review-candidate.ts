import type { SessionScope } from '@seta/core';
import { emit, withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { campaignCandidates, recruiterOverrides } from '../db/schema.ts';
import { recomputeCampaignCounters } from './campaign.ts';

export async function reviewCampaignCandidate(args: {
  campaignId: string;
  candidateId: string;
  fitScore: number;
  reason: string;
  session: SessionScope;
}): Promise<typeof campaignCandidates.$inferSelect | null> {
  let result: typeof campaignCandidates.$inferSelect | null = null;
  await withEmit(
    { actor: { userId: args.session.user_id, tenantId: args.session.tenant_id } },
    async (tx) => {
      const [current] = await tx
        .select()
        .from(campaignCandidates)
        .where(
          and(
            eq(campaignCandidates.tenant_id, args.session.tenant_id),
            eq(campaignCandidates.campaign_id, args.campaignId),
            eq(campaignCandidates.candidate_id, args.candidateId),
          ),
        )
        .limit(1);
      if (!current) return;
      const report = (current.screening_report ?? {}) as { promptVersion?: string };
      await tx.insert(recruiterOverrides).values({
        tenant_id: args.session.tenant_id,
        campaign_id: args.campaignId,
        candidate_id: args.candidateId,
        field: 'fit_score',
        ai_value: { fitScore: current.fit_score },
        human_value: { fitScore: args.fitScore },
        reason: args.reason,
        prompt_version: report.promptVersion ?? null,
        created_by: args.session.user_id,
      });
      const [updated] = await tx
        .update(campaignCandidates)
        .set({
          reviewed_fit_score: args.fitScore,
          reviewed_by: args.session.user_id,
          reviewed_at: new Date(),
          review_reason: args.reason,
          updated_at: new Date(),
        })
        .where(eq(campaignCandidates.id, current.id))
        .returning();
      result = updated ?? null;
      await emit({
        tenantId: args.session.tenant_id,
        aggregateType: 'smartrecruit_candidate',
        aggregateId: args.candidateId,
        eventType: 'smartrecruit.candidate.score_overridden',
        eventVersion: 1,
        causedByUserId: args.session.user_id,
        payload: {
          campaignId: args.campaignId,
          candidateId: args.candidateId,
          aiFitScore: current.fit_score,
          reviewedFitScore: args.fitScore,
          reason: args.reason,
        },
      });
    },
  );
  if (result) {
    await recomputeCampaignCounters({
      campaignId: args.campaignId,
      tenantId: args.session.tenant_id,
    });
  }
  return result as typeof campaignCandidates.$inferSelect | null;
}
