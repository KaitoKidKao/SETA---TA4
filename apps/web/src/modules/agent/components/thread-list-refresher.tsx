import { useAuiState } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { agentApi } from '../api/client.ts';
import { workflowsQueryKeys } from '../workflows/state/query-keys.ts';

interface Props {
  threadId?: string;
}

export function ThreadListRefresher({ threadId }: Props) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const wasRunning = useRef(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      const refetchThreads = () =>
        queryClient.invalidateQueries({ queryKey: ['agent', 'threads'] });
      void refetchThreads();
      if (threadId) {
        void queryClient.invalidateQueries({ queryKey: ['agent', 'thread', threadId] });
      }

      // Chat-flow HITL: if the agent called proposeAssignment (or any other
      // chat-HITL tool), the approval row is now committed. Invalidate here so
      // ChatEmbeddedHitl picks it up without waiting for the next focus event.
      void queryClient.invalidateQueries({ queryKey: workflowsQueryKeys.pendingApprovals() });

      // New-thread navigation: when there was no threadId before the stream
      // (first message in a new chat), find the just-created thread and push
      // ?thread=<id> into the URL — same UX as ChatGPT / Claude.
      // Only fires on /agent/chat; the panel embeds the transcript on other routes.
      if (!threadId && location.pathname === '/agent/chat') {
        void (async () => {
          try {
            const threads = await agentApi.listThreads();
            if (!Array.isArray(threads) || threads.length === 0) return;
            const newest = threads.toSorted(
              (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
            )[0];
            if (!newest) return;
            void navigate({
              to: '/agent/chat',
              search: { thread: newest.id },
              replace: true,
            });
          } catch {
            // Non-fatal: the thread is still accessible from the rail.
          }
        })();
      }

      // Mastra's generateTitle runs after the stream ends — re-poll so it lands in the rail.
      const timers = [setTimeout(refetchThreads, 1500), setTimeout(refetchThreads, 4000)];
      wasRunning.current = isRunning;
      return () => {
        for (const t of timers) clearTimeout(t);
      };
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient, threadId, navigate, location.pathname]);

  return null;
}
