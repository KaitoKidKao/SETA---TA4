import { AgentRegistry } from '@seta/agent-sdk';
import { smartrecruitWorkflowSpec } from '../workflows/smartrecruit-workflow.ts';

// Side-effect registration into the agent engine's AgentRegistry instance.
//
// This must run before AgentRegistry.freeze() (init-registry.ts) so the
// smartrecruit workflow is visible to the agent routes — most importantly the
// `/workflows/runs/smartrecruit/start` REST path, which does
// `mastra.getWorkflow('smartrecruit')`. Registering only from the platform
// module loader (register.ts) is not enough: in the bundled production build
// that path can resolve a *different* @seta/agent-sdk singleton than the agent
// package reads, leaving the workflow absent from the engine's registry. The
// engine importing this subpath directly (allowed by the depcruise
// `/agent-tools/register.ts` exception) pins it to the correct instance, the
// same way planner/identity/knowledge do.
AgentRegistry.registerWorkflow(smartrecruitWorkflowSpec);
