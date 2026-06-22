import { z } from 'zod';

export const CampaignStageCompletedPayloadSchema = z.object({
  campaignId: z.string().uuid(),
  workflowRunId: z.string().uuid(),
  stage: z.enum(['screening', 'drafting', 'sending']),
  status: z.enum([
    'screening_completed',
    'awaiting_outreach_approval',
    'completed',
    'completed_with_errors',
  ]),
});

export type CampaignStageCompletedPayload = z.infer<typeof CampaignStageCompletedPayloadSchema>;

export const SMARTRECRUIT_EVENTS: Record<string, z.ZodSchema> = {
  'smartrecruit.campaign.screening_completed': CampaignStageCompletedPayloadSchema,
  'smartrecruit.campaign.drafting_completed': CampaignStageCompletedPayloadSchema,
  'smartrecruit.campaign.sending_completed': CampaignStageCompletedPayloadSchema,
  'smartrecruit.candidate.score_overridden': z.object({
    campaignId: z.string().uuid(),
    candidateId: z.string().uuid(),
    aiFitScore: z.number().int().nullable(),
    reviewedFitScore: z.number().int().min(0).max(100),
    reason: z.string().min(5),
  }),
  'smartrecruit.campaign.report_generated': z.object({
    campaignId: z.string().uuid(),
    reportId: z.string().uuid(),
    version: z.number().int().positive(),
    contentHash: z.string().min(1),
  }),
} as const;
