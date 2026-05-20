import { ChatToolCall } from '@seta/shared-ui';

export interface ListMyThreadsProps {
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { threads?: unknown[] };
}

export function ListMyThreadsRenderer({ state, output }: ListMyThreadsProps) {
  if (state === 'output-available') {
    return (
      <ChatToolCall
        name="copilot.listMyThreads"
        status="ok"
        summary={`${output?.threads?.length ?? 0} threads`}
        payload={output}
      />
    );
  }
  if (state === 'output-error')
    return <ChatToolCall name="copilot.listMyThreads" status="error" summary="failed" />;
  return <ChatToolCall name="copilot.listMyThreads" status="running" />;
}
