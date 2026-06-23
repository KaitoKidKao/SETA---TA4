import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Mastra } from '@mastra/core';
import type { ContributionRegistry, ErrorMapper } from '@seta/core';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { smartrecruitAgentTools } from './backend/agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { buildSmartrecruitRoutes } from './backend/http/index.ts';
import { smartrecruitJobs } from './backend/jobs/index.ts';
import {
  buildResumeAfterDraftingSubscriber,
  buildResumeAfterScreeningSubscriber,
  buildResumeAfterSendingSubscriber,
} from './backend/subscribers/resume-campaign-workflow.ts';
import {
  smartrecruitWorkflow,
  smartrecruitWorkflowSpec,
} from './backend/workflows/smartrecruit-workflow.ts';
import { SMARTRECRUIT_EVENTS } from './events.ts';
import { SMARTRECRUIT_PERMISSIONS, SmartrecruitError } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export const smartrecruitErrorMapper: ErrorMapper = (err) => {
  if (!(err instanceof SmartrecruitError)) return null;
  const status: ContentfulStatusCode =
    err.code === 'FORBIDDEN'
      ? 403
      : err.code === 'NOT_FOUND'
        ? 404
        : err.code === 'CONFLICT'
          ? 409
          : err.code === 'SERVICE_UNAVAILABLE'
            ? 503
            : 400;
  return { status, body: { error: err.code, message: err.message, details: err.details } };
};

export function registerSmartrecruitContributions(reg: ContributionRegistry): void {
  // NOTE: the workflow spec is registered into AgentRegistry from the
  // engine-pinned side-effect module `@seta/smartrecruit/agent-tools/register`
  // (imported by the agent package's init-registry before freeze). Registering
  // it here as well would double-register in single-instance dev and, in the
  // bundled build, write to the wrong @seta/agent-sdk singleton.
  reg.module({
    name: 'smartrecruit',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: SMARTRECRUIT_EVENTS,
    rbac: SMARTRECRUIT_PERMISSIONS,
    agentTools: smartrecruitAgentTools,
    jobs: smartrecruitJobs,
    crontab: '*/5 * * * * smartrecruit:hm_feedback_reminder_scan',
    subscriberBuilders: [
      buildResumeAfterScreeningSubscriber,
      buildResumeAfterDraftingSubscriber,
      buildResumeAfterSendingSubscriber,
    ],
    routes: { mountAt: '/', build: buildSmartrecruitRoutes },
    errorMapper: smartrecruitErrorMapper,
    workflows: [
      {
        id: 'smartrecruit',
        build: (mastra) => {
          // mastra is passed in from agent package buildMastraFull
          (mastra as Mastra).addWorkflow(smartrecruitWorkflow);
        },
        inputSchema: smartrecruitWorkflowSpec.inputSchema,
      },
    ],
  });
}
