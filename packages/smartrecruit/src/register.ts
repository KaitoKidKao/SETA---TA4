import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AgentRegistry } from '@seta/agent-sdk';
import type { ContributionRegistry } from '@seta/core';
import { smartrecruitAgentTools } from './backend/agent-tools.ts';
import * as schema from './backend/db/schema.ts';
import { buildSmartrecruitRoutes } from './backend/http/index.ts';
import {
  smartrecruitWorkflow,
  smartrecruitWorkflowSpec,
} from './backend/workflows/smartrecruit-workflow.ts';
import { SMARTRECRUIT_EVENTS } from './events.ts';
import { SMARTRECRUIT_PERMISSIONS } from './rbac.ts';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function registerSmartrecruitContributions(reg: ContributionRegistry): void {
  // Register workflow to AgentRegistry (static registry used by agent routes)
  AgentRegistry.registerWorkflow(smartrecruitWorkflowSpec);

  reg.module({
    name: 'smartrecruit',
    schema,
    migrationsDir: resolve(__dirname, '../drizzle/migrations'),
    events: SMARTRECRUIT_EVENTS,
    rbac: SMARTRECRUIT_PERMISSIONS,
    agentTools: smartrecruitAgentTools,
    routes: { mountAt: '/', build: buildSmartrecruitRoutes },
    workflows: [
      {
        id: 'smartrecruit',
        build: (mastra) => {
          // mastra is passed in from agent package buildMastraFull
          (mastra as any).addWorkflow(smartrecruitWorkflow);
        },
        inputSchema: smartrecruitWorkflowSpec.inputSchema,
      },
    ],
  });
}
