import { describe, expect, it, vi } from 'vitest';
import { copilotApi } from './client';

describe('copilotApi', () => {
  it('listThreads parses the JSON response shape', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              threads: [{ id: 't1', title: 'x', updatedAt: '2026-05-20T00:00:00Z' }],
            }),
            { headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const out = await copilotApi.listThreads();
    expect(out[0]?.id).toBe('t1');
  });

  it('approveHitl POSTs and returns the parsed body', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'approved', outcome: { ok: true } }), {
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );
    const out = await copilotApi.approveHitl('call-1');
    expect(out.status).toBe('approved');
  });
});
