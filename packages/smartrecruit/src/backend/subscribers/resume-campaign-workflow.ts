import type { Mastra } from '@mastra/core';
import type { SubscriberBuilder, SubscriberBuilderDeps } from '@seta/agent-sdk';
import type { DomainEvent, SubscriberDef } from '@seta/shared-types';
import { CampaignStageCompletedPayloadSchema } from '../../events.ts';

const WORKFLOW_ID = 'smartrecruit.workflow';
const STEP_BY_STAGE = {
  screening: 'smartrecruit.screenCvs',
  drafting: 'smartrecruit.draftOutreach',
  sending: 'smartrecruit.executeOutreach',
} as const;

function isStepSuspended(snapshot: unknown, stepId: string): boolean {
  if (!snapshot || typeof snapshot !== 'object') return false;
  const value = snapshot as Record<string, unknown>;
  const steps = value.steps;
  if (steps && typeof steps === 'object') {
    const step = (steps as Record<string, unknown>)[stepId];
    if (step && typeof step === 'object' && (step as { status?: unknown }).status === 'suspended') {
      return true;
    }
  }
  const suspendedPaths = value.suspendedPaths;
  return Boolean(
    suspendedPaths &&
      typeof suspendedPaths === 'object' &&
      Object.keys(suspendedPaths as Record<string, unknown>).some((path) => path.includes(stepId)),
  );
}

async function loadSnapshot(mastra: Mastra, runId: string): Promise<unknown> {
  const storage = mastra.getStorage();
  if (!storage) return null;
  const workflowsStore = await storage.getStore('workflows');
  if (!workflowsStore) return null;
  return workflowsStore.loadWorkflowSnapshot({ workflowName: WORKFLOW_ID, runId });
}

function buildSubscriber(subscription: string, eventType: string): SubscriberBuilder {
  return (deps: SubscriberBuilderDeps): SubscriberDef => {
    const mastra = deps.mastra as Mastra;
    return {
      subscription,
      event: eventType,
      eventVersion: 1,
      handler: async (event: DomainEvent<unknown>) => {
        const payload = CampaignStageCompletedPayloadSchema.parse(event.payload);
        const step = STEP_BY_STAGE[payload.stage];
        const snapshot = await loadSnapshot(mastra, payload.workflowRunId);
        if (!isStepSuspended(snapshot, step)) return;

        const workflow = mastra.getWorkflow(WORKFLOW_ID);
        const run = await workflow.createRun({ runId: payload.workflowRunId });
        await run.resume({
          step: [step],
          resumeData: {
            kind: 'campaign_stage_completed',
            campaignId: payload.campaignId,
            stage: payload.stage,
            status: payload.status,
          },
        });
      },
    };
  };
}

export const buildResumeAfterScreeningSubscriber = buildSubscriber(
  'smartrecruit.campaign.resume-after-screening',
  'smartrecruit.campaign.screening_completed',
);
export const buildResumeAfterDraftingSubscriber = buildSubscriber(
  'smartrecruit.campaign.resume-after-drafting',
  'smartrecruit.campaign.drafting_completed',
);
export const buildResumeAfterSendingSubscriber = buildSubscriber(
  'smartrecruit.campaign.resume-after-sending',
  'smartrecruit.campaign.sending_completed',
);
