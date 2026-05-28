import { Mutex } from 'async-mutex';
import { type AgentMemoryHandle, RC_AGENT_MEMORY } from './request-context.ts';
import {
  parseWorkingMemory,
  type RecentTask,
  serializeWorkingMemory,
  type WorkingMemoryEntities,
} from './working-memory-schema.ts';

type ToolExecuteCtx = {
  agent?: { threadId?: string; resourceId?: string };
  requestContext?: { get: (k: string) => unknown };
};

export type EntityPatch = Partial<{
  recentTasks: Array<{ taskId: string; title: string }>;
  lastDiscussedTaskId: string | null;
  lastProposedCandidateUserId: string | null;
  pendingDecision: WorkingMemoryEntities['pendingDecision'];
  rejectedCandidates: WorkingMemoryEntities['rejectedCandidates'];
}>;

// Local mutex map mirrors Mastra's per-resource serialization. We need our own
// because Mastra's mutex only wraps its updateWorkingMemory call, not our
// read-merge-write window.
const mutexes = new Map<string, Mutex>();

function getMutex(resourceId: string): Mutex {
  const existing = mutexes.get(resourceId);
  if (existing) return existing;
  const fresh = new Mutex();
  mutexes.set(resourceId, fresh);
  return fresh;
}

export async function recordEntityExposure(ctx: ToolExecuteCtx, patch: EntityPatch): Promise<void> {
  const handle = ctx.requestContext?.get(RC_AGENT_MEMORY) as AgentMemoryHandle | undefined;
  if (!handle) return; // workflow/cron path — no chat memory
  const threadId = ctx.agent?.threadId;
  const resourceId = ctx.agent?.resourceId;
  if (!threadId || !resourceId) return;

  const release = await getMutex(resourceId).acquire();
  try {
    const raw = await handle.memory.getWorkingMemory({
      threadId,
      resourceId,
      memoryConfig: handle.memoryConfig,
    });
    const current = parseWorkingMemory(raw);
    const nextEntities = mergeEntities(current.entities, patch);
    const next = { ...current, entities: nextEntities };
    await handle.memory.updateWorkingMemory({
      threadId,
      resourceId,
      workingMemory: serializeWorkingMemory(next),
      memoryConfig: handle.memoryConfig,
    });
  } finally {
    release();
  }
}

function mergeEntities(current: WorkingMemoryEntities, patch: EntityPatch): WorkingMemoryEntities {
  const now = new Date().toISOString();
  const next: WorkingMemoryEntities = { ...current };

  if (patch.recentTasks) {
    next.recentTasks = mergeRecentTasks(current.recentTasks, patch.recentTasks, now);
  }
  if (patch.lastDiscussedTaskId !== undefined) next.lastDiscussedTaskId = patch.lastDiscussedTaskId;
  if (patch.lastProposedCandidateUserId !== undefined) {
    next.lastProposedCandidateUserId = patch.lastProposedCandidateUserId;
  }
  if (patch.pendingDecision !== undefined) next.pendingDecision = patch.pendingDecision;
  if (patch.rejectedCandidates !== undefined) next.rejectedCandidates = patch.rejectedCandidates;
  return next;
}

function mergeRecentTasks(
  existing: ReadonlyArray<RecentTask>,
  incoming: ReadonlyArray<{ taskId: string; title: string }>,
  now: string,
): RecentTask[] {
  // incomingIdx tracks position in the incoming array for stable tiebreaking:
  // lower index = appeared earlier in the batch = sorted first among same-timestamp entries.
  const incomingIdx = new Map<string, number>();
  let idx = 0;
  for (const t of incoming) {
    incomingIdx.set(t.taskId, idx);
    idx++;
  }

  const byId = new Map<string, RecentTask>();
  for (const t of existing) byId.set(t.taskId, t);
  for (const t of incoming)
    byId.set(t.taskId, { taskId: t.taskId, title: t.title, lastSeenAt: now });

  return [...byId.values()]
    .sort((a, b) => {
      const timeDiff = b.lastSeenAt.localeCompare(a.lastSeenAt);
      if (timeDiff !== 0) return timeDiff;
      // Within same timestamp (same batch), preserve incoming array order.
      const ia = incomingIdx.get(a.taskId) ?? Infinity;
      const ib = incomingIdx.get(b.taskId) ?? Infinity;
      return ia - ib;
    })
    .slice(0, 10);
}

// Test-only escape hatch — never call from production code.
export function __resetMutexesForTests(): void {
  mutexes.clear();
}
