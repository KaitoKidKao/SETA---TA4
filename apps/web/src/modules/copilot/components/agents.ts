export type AgentName = 'router' | 'self';

export interface AgentOption {
  name: AgentName;
  label: string;
  description: string;
}

export const AGENTS: readonly [AgentOption, ...AgentOption[]] = [
  {
    name: 'router',
    label: 'Supervisor',
    description: 'Routes to the right specialist',
  },
  {
    name: 'self',
    label: 'Self',
    description: 'Answers questions about your context',
  },
];

export const DEFAULT_AGENT: AgentOption = AGENTS[0];

export function agentLabel(name: AgentName): string {
  return AGENTS.find((a) => a.name === name)?.label ?? name;
}
