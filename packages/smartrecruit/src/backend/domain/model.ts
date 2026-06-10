import type { MastraModelConfig } from '@mastra/core/llm';

export function getModelConfig(): MastraModelConfig {
  const modelStr = process.env.AGENT_MODELS ?? 'openai/gpt-4o-mini';
  const first = modelStr.split(',')[0]?.trim() ?? 'openai/gpt-4o-mini';

  let id = first;
  const lastColon = first.lastIndexOf(':');
  if (lastColon > -1) {
    id = first.slice(0, lastColon);
  }

  const slash = id.indexOf('/');
  if (slash <= 0 || slash === id.length - 1) {
    return 'openai/gpt-4o-mini';
  }

  const providerId = id.slice(0, slash);
  const modelId = id.slice(slash + 1);

  if (providerId === 'mock') {
    return {
      providerId: 'openai',
      modelId: 'gpt-4o-mini',
      apiKey: process.env.OPENAI_API_KEY ?? 'mock-key',
    };
  }

  const upper = providerId.toUpperCase().replace(/-/g, '_');
  const baseUrl = process.env[`${upper}_BASE_URL`];
  const apiKey = process.env[`${upper}_API_KEY`] ?? '';

  if (baseUrl) {
    return {
      providerId,
      modelId,
      url: baseUrl,
      apiKey,
    };
  }

  return {
    providerId,
    modelId,
    apiKey,
  };
}
