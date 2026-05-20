import { ChatToolCall } from '@seta/shared-ui';

export interface ServerTimeProps {
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { iso?: string };
}

export function ServerTimeRenderer({ state, output }: ServerTimeProps) {
  if (state === 'output-available') {
    return (
      <ChatToolCall
        name="core.serverTime"
        status="ok"
        summary={output?.iso ?? 'now'}
        payload={output}
      />
    );
  }
  if (state === 'output-error')
    return <ChatToolCall name="core.serverTime" status="error" summary="failed" />;
  return <ChatToolCall name="core.serverTime" status="running" />;
}
