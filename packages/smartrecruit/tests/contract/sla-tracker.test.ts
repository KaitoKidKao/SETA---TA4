import path from 'node:path';
import type { SessionEnv } from '@seta/core';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';
import { hmFeedbackRequests } from '../../src/backend/db/schema.ts';
import { registerSmartrecruitRoutes } from '../../src/backend/http/routes.ts';
import { withSmartrecruitTestDb } from '../integration/helpers.ts';

describe('SLA Tracker Route Contracts', () => {
  it('implements search, status filters, invalid query, cross-tenant isolation, and normalized timestamps', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      // 1. Seed database with test requests
      const tenantId = session.tenant_id;
      const otherTenantId = crypto.randomUUID();

      await db.insert(hmFeedbackRequests).values([
        {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          external_feedback_id: 'FB-TEST-1',
          candidate_name: 'Alice Johnson',
          position: 'Backend Developer',
          hiring_manager: 'Manager One',
          hiring_manager_email: 'mgr1@example.com',
          shortlisted_at: new Date('2025-04-01T10:00:00Z'),
          feedback_due_at: new Date('2025-04-03T10:00:00Z'),
          feedback_status: 'Pending',
        },
        {
          id: crypto.randomUUID(),
          tenant_id: tenantId,
          external_feedback_id: 'FB-TEST-2',
          candidate_name: 'Bob Smith',
          position: 'Frontend Developer',
          hiring_manager: 'Manager Two',
          hiring_manager_email: 'mgr2@example.com',
          shortlisted_at: new Date('2025-04-01T10:00:00Z'),
          feedback_due_at: new Date('2025-04-03T10:00:00Z'),
          feedback_status: 'Submitted',
          submitted_at: new Date('2025-04-02T10:00:00Z'),
        },
        // Cross-tenant data
        {
          id: crypto.randomUUID(),
          tenant_id: otherTenantId,
          external_feedback_id: 'FB-CROSS',
          candidate_name: 'Cross Candidate',
          position: 'Designer',
          hiring_manager: 'Manager Three',
          hiring_manager_email: 'mgr3@example.com',
          shortlisted_at: new Date('2025-04-01T10:00:00Z'),
          feedback_due_at: new Date('2025-04-03T10:00:00Z'),
          feedback_status: 'Pending',
        },
      ]);

      // 2. Set up Hono application
      const app = new Hono<SessionEnv>();
      app.use(async (c, next) => {
        c.set('user', session);
        await next();
      });
      registerSmartrecruitRoutes(app, {
        workers: {
          addJob: async () => {},
        } as any,
      });

      // --- Test 1: list all items for current tenant (verifies cross-tenant isolation and normalized timestamps) ---
      const resAll = await app.request('/api/smartrecruit/v1/sla-tracker');
      expect(resAll.status).toBe(200);
      const bodyAll = (await resAll.json()) as { tracker: any[] };
      expect(bodyAll.tracker).toHaveLength(2);

      // Ensure cross tenant row is NOT returned
      expect(bodyAll.tracker.some((t) => t.feedbackId === 'FB-CROSS')).toBe(false);

      // Verify normalized timestamps (ISO 8601 strings)
      const t1 = bodyAll.tracker.find((t) => t.feedbackId === 'FB-TEST-1');
      expect(t1).toBeDefined();
      expect(t1.shortlistedAt).toBe('2025-04-01T10:00:00.000Z');
      expect(t1.feedbackDueAt).toBe('2025-04-03T10:00:00.000Z');

      // --- Test 2: Search filter (matches name, position, or manager) ---
      const resSearch = await app.request('/api/smartrecruit/v1/sla-tracker?search=Alice');
      expect(resSearch.status).toBe(200);
      const bodySearch = (await resSearch.json()) as { tracker: any[] };
      expect(bodySearch.tracker).toHaveLength(1);
      expect(bodySearch.tracker[0].feedbackId).toBe('FB-TEST-1');

      // --- Test 3: Status filter (submitted status) ---
      const resStatus = await app.request('/api/smartrecruit/v1/sla-tracker?status=submitted');
      expect(resStatus.status).toBe(200);
      const bodyStatus = (await resStatus.json()) as { tracker: any[] };
      expect(bodyStatus.tracker).toHaveLength(1);
      expect(bodyStatus.tracker[0].feedbackId).toBe('FB-TEST-2');

      // --- Test 4: Empty search/filter results ---
      const resEmpty = await app.request('/api/smartrecruit/v1/sla-tracker?search=NonExistent');
      expect(resEmpty.status).toBe(200);
      const bodyEmpty = (await resEmpty.json()) as { tracker: any[] };
      expect(bodyEmpty.tracker).toHaveLength(0);

      // --- Test 5: Invalid status query value (should return 400 validation error) ---
      const resInvalid = await app.request(
        '/api/smartrecruit/v1/sla-tracker?status=invalid-status',
      );
      expect(resInvalid.status).toBe(400);
    });
  });
});
