import { HitlResolveResponse, type ThreadSummary, ThreadsResponse } from './schemas';

async function fetchJson<T>(
  url: string,
  init?: RequestInit,
  schema?: { parse: (v: unknown) => T },
): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: 'unknown' }))) as {
      error?: string;
      message?: string;
    };
    throw Object.assign(new Error(body.message ?? res.statusText), {
      status: res.status,
      code: body.error,
    });
  }
  const json = (await res.json()) as unknown;
  return schema ? schema.parse(json) : (json as T);
}

export const copilotApi = {
  async listThreads(): Promise<ThreadSummary[]> {
    const out = await fetchJson('/api/copilot/v1/threads', undefined, ThreadsResponse);
    return out.threads;
  },
  async approveHitl(callId: string) {
    return fetchJson(
      `/api/copilot/v1/hitl/${encodeURIComponent(callId)}/approve`,
      { method: 'POST' },
      HitlResolveResponse,
    );
  },
  async rejectHitl(callId: string, note?: string) {
    return fetchJson(
      `/api/copilot/v1/hitl/${encodeURIComponent(callId)}/reject`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note }),
      },
      HitlResolveResponse,
    );
  },
};
