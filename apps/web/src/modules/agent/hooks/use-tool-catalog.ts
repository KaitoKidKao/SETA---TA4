import { useQuery } from '@tanstack/react-query';

export interface ToolCatalogEntry {
  id: string;
  name: string;
  description: string;
}

export interface AgentEntry {
  name: string;
  label: string;
}

interface CatalogResponse {
  tools: ToolCatalogEntry[];
}

interface AgentsResponse {
  agents: AgentEntry[];
}

async function fetchCatalog(): Promise<CatalogResponse> {
  const res = await fetch('/api/agent/v1/tools', { credentials: 'include' });
  if (!res.ok) throw new Error(`tools ${res.status}`);
  return (await res.json()) as CatalogResponse;
}

async function fetchAgents(): Promise<AgentsResponse> {
  const res = await fetch('/api/agent/v1/agents', { credentials: 'include' });
  if (!res.ok) throw new Error(`agents ${res.status}`);
  return (await res.json()) as AgentsResponse;
}

export function useToolCatalog() {
  const q = useQuery({
    queryKey: ['agent', 'tools'],
    queryFn: fetchCatalog,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
  const tools = q.data?.tools ?? [];
  const byId = new Map(tools.map((t) => [t.id, t]));
  const nameFor = (id: string): string => byId.get(id)?.name ?? id;
  return { tools, nameFor, isLoading: q.isLoading };
}

export function useAgentCatalog() {
  const q = useQuery({
    queryKey: ['agent', 'agents'],
    queryFn: fetchAgents,
    staleTime: 5 * 60_000,
    gcTime: 60 * 60_000,
  });
  return { agents: q.data?.agents ?? [], isLoading: q.isLoading };
}
