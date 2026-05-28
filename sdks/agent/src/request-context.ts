import type { RequestContext } from '@mastra/core/request-context';
import { z } from 'zod';
import type { ChatHitlRecorder } from './hitl/chat-hitl.ts';

export const RequestContextSchema = z.object({
  actor: z.object({
    type: z.literal('user'),
    user_id: z.string().min(1),
  }),
});

/**
 * Full state shape carried on the Mastra RequestContext for every agent
 * request. `actor` is validated by Mastra via `requestContextSchema`; the
 * remaining fields are set imperatively by the route layer before the
 * agent/workflow step runs.
 *
 * __seta_chat_hitl_recorder__ is injected by the chat route for tools that
 * write a workflow_approvals row directly (chat-flow HITL). See chat-hitl.ts.
 */
export interface AgentRequestContext {
  actor: { type: 'user'; user_id: string };
  tenant_id: string;
  role_summary: { roles: string[]; cross_tenant_read: boolean };
  // Key matches RC_CHAT_HITL_RECORDER in hitl/chat-hitl.ts — typed here so
  // requestContext.get(RC_CHAT_HITL_RECORDER) is type-safe.
  __seta_chat_hitl_recorder__?: ChatHitlRecorder;
}

export interface AuthenticatedUserActor {
  type: 'user';
  user_id: string;
}

export function actorFromContext(ctx: {
  requestContext?: RequestContext<AgentRequestContext>;
}): AuthenticatedUserActor {
  const raw = ctx?.requestContext?.get('actor');
  if (!raw || typeof raw !== 'object') {
    throw new Error('unauthenticated');
  }
  const a = raw as Partial<AuthenticatedUserActor>;
  if (a.type !== 'user' || !a.user_id) {
    throw new Error('unauthenticated');
  }
  return { type: 'user', user_id: a.user_id };
}
