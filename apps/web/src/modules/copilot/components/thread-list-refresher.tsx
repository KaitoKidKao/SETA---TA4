import { useAuiState } from '@assistant-ui/react';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

interface Props {
  threadId?: string;
}

export function ThreadListRefresher({ threadId }: Props) {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const wasRunning = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (wasRunning.current && !isRunning) {
      void queryClient.invalidateQueries({ queryKey: ['copilot', 'threads'] });
      if (threadId) {
        void queryClient.invalidateQueries({ queryKey: ['copilot', 'thread', threadId] });
      }
    }
    wasRunning.current = isRunning;
  }, [isRunning, queryClient, threadId]);

  return null;
}
