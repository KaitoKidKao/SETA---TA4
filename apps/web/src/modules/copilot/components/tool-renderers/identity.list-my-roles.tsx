import { ChatToolCall } from '@seta/shared-ui';

export interface ListMyRolesProps {
  args: Record<string, unknown>;
  state: 'input-streaming' | 'output-available' | 'output-error';
  output?: { roles?: Array<{ slug: string }>; permissions?: string[] };
}

export function ListMyRolesRenderer({ state, output }: ListMyRolesProps) {
  if (state === 'output-available') {
    const roleCount = output?.roles?.length ?? 0;
    const permCount = output?.permissions?.length ?? 0;
    return (
      <ChatToolCall
        name="identity.listMyRoles"
        status="ok"
        summary={`${roleCount} roles, ${permCount} permissions`}
        payload={output}
      />
    );
  }
  if (state === 'output-error')
    return <ChatToolCall name="identity.listMyRoles" status="error" summary="failed" />;
  return <ChatToolCall name="identity.listMyRoles" status="running" />;
}
