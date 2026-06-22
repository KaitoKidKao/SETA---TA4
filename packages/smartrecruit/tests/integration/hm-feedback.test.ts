import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi } from 'vitest';
import { hmFeedbackReminderAttempts, hmFeedbackRequests } from '../../src/backend/db/schema.ts';
import {
  approveHmFeedbackReminder,
  importHmFeedbackFromWorkbook,
  listHmFeedbackTracker,
  prepareHmFeedbackReminderDraft,
} from '../../src/backend/domain/hm-feedback.ts';
import { withSmartrecruitTestDb } from './helpers.ts';

describe('HM feedback SLA persistence', () => {
  it('keeps tracker reads tenant-scoped and derives state from deadline', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      await db.insert(hmFeedbackRequests).values([
        {
          tenant_id: session.tenant_id,
          external_feedback_id: 'FB-1',
          candidate_name: 'Candidate A',
          position: 'Backend Engineer',
          hiring_manager: 'HM One',
          hiring_manager_email: 'hm@example.com',
          shortlisted_at: new Date('2025-04-01T00:00:00Z'),
          feedback_due_at: new Date('2025-04-03T00:00:00Z'),
          feedback_status: 'Pending',
        },
        {
          tenant_id: crypto.randomUUID(),
          external_feedback_id: 'FB-2',
          candidate_name: 'Other Tenant',
          position: 'Backend Engineer',
          hiring_manager: 'HM Two',
          shortlisted_at: new Date('2025-04-01T00:00:00Z'),
          feedback_due_at: new Date('2025-04-03T00:00:00Z'),
          feedback_status: 'Pending',
        },
      ]);

      const tracker = await listHmFeedbackTracker({
        tenantId: session.tenant_id,
        now: new Date('2025-04-03T00:00:00Z'),
      });

      expect(tracker).toHaveLength(1);
      expect(tracker[0]?.feedbackId).toBe('FB-1');
      expect(tracker[0]?.slaState).toBe('overdue');
      expect(tracker[0]?.shortlistedAt).toBe('2025-04-01T00:00:00.000Z');
    });
  });

  it('creates one reminder draft and one queued attempt per stage', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      const [request] = await db
        .insert(hmFeedbackRequests)
        .values({
          tenant_id: session.tenant_id,
          external_feedback_id: 'FB-1',
          candidate_name: 'Candidate A',
          position: 'Backend Engineer',
          hiring_manager: 'HM One',
          hiring_manager_email: 'hm@example.com',
          shortlisted_at: new Date('2025-04-01T00:00:00Z'),
          feedback_due_at: new Date(Date.now() - 60_000),
          feedback_status: 'Pending',
        })
        .returning();

      const firstDraft = await prepareHmFeedbackReminderDraft({
        tenantId: session.tenant_id,
        feedbackRequestId: request!.id,
      });
      const secondDraft = await prepareHmFeedbackReminderDraft({
        tenantId: session.tenant_id,
        feedbackRequestId: request!.id,
      });
      expect(firstDraft.id).toBe(secondDraft.id);

      const addJob = vi.fn(async () => {});
      const firstAttempt = await approveHmFeedbackReminder({
        tenantId: session.tenant_id,
        feedbackRequestId: request!.id,
        session,
        addJob,
      });
      const secondAttempt = await approveHmFeedbackReminder({
        tenantId: session.tenant_id,
        feedbackRequestId: request!.id,
        session,
        addJob,
      });

      expect(firstAttempt.id).toBe(secondAttempt.id);
      expect(addJob).toHaveBeenCalledTimes(1);
      const attempts = await db.select().from(hmFeedbackReminderAttempts);
      expect(attempts).toHaveLength(1);
      expect(attempts[0]?.status).toBe('queued');
    });
  });

  it('rejects approval after feedback is submitted', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      const [request] = await db
        .insert(hmFeedbackRequests)
        .values({
          tenant_id: session.tenant_id,
          external_feedback_id: 'FB-1',
          candidate_name: 'Candidate A',
          position: 'Backend Engineer',
          hiring_manager: 'HM One',
          hiring_manager_email: 'hm@example.com',
          shortlisted_at: new Date('2025-04-01T00:00:00Z'),
          feedback_due_at: new Date(Date.now() - 60_000),
          feedback_status: 'Pending',
        })
        .returning();

      await prepareHmFeedbackReminderDraft({
        tenantId: session.tenant_id,
        feedbackRequestId: request!.id,
      });
      await db
        .update(hmFeedbackRequests)
        .set({ feedback_status: 'Submitted', submitted_at: new Date() })
        .where(eq(hmFeedbackRequests.id, request!.id));

      await expect(
        approveHmFeedbackReminder({
          tenantId: session.tenant_id,
          feedbackRequestId: request!.id,
          session,
          addJob: async () => {},
        }),
      ).rejects.toThrow(/submitted/i);
    });
  });

  it('proves workbook import, upsert behavior, tenant isolation, and transactional event writes', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      const mockFilePath = path.resolve(
        __dirname,
        '../../../../mock-data/03_ta_hire_request_jd_generation.xlsx',
      );

      // 1. Proves import behavior (first time, creates rows)
      const importResult1 = await importHmFeedbackFromWorkbook({
        filePath: mockFilePath,
        session,
        timeZone: 'Asia/Ho_Chi_Minh',
      });
      expect(importResult1.created).toBeGreaterThan(0);
      expect(importResult1.invalid).toHaveLength(0);

      const countAfterImport = importResult1.created;

      // 2. Proves upsert behavior (second time, updates rows instead of creating duplicates)
      const importResult2 = await importHmFeedbackFromWorkbook({
        filePath: mockFilePath,
        session,
        timeZone: 'Asia/Ho_Chi_Minh',
      });
      expect(importResult2.created).toBe(0);
      expect(importResult2.updated).toBe(countAfterImport);

      // 3. Proves tenant isolation
      const trackerForTenant = await listHmFeedbackTracker({
        tenantId: session.tenant_id,
      });
      expect(trackerForTenant.length).toBe(countAfterImport);

      const otherTenantId = crypto.randomUUID();
      const trackerForOtherTenant = await listHmFeedbackTracker({
        tenantId: otherTenantId,
      });
      expect(trackerForOtherTenant).toHaveLength(0);

      // 4. Proves transactional state and event writes on approval
      // Find an eligible feedback request in the imported list, or make one eligible
      let eligibleItem = trackerForTenant.find(
        (item) => item.reminderAvailable && item.hiringManagerEmail,
      );
      if (!eligibleItem) {
        const itemToModify = trackerForTenant[0];
        expect(itemToModify).toBeDefined();
        await db
          .update(hmFeedbackRequests)
          .set({
            feedback_status: 'Pending',
            submitted_at: null,
            hiring_manager_email: 'hm@example.com',
          })
          .where(eq(hmFeedbackRequests.id, itemToModify!.id));

        const updatedTracker = await listHmFeedbackTracker({
          tenantId: session.tenant_id,
        });
        eligibleItem = updatedTracker.find((item) => item.id === itemToModify!.id);
      }
      expect(eligibleItem).toBeDefined();
      expect(eligibleItem!.reminderAvailable).toBe(true);

      const addJob = vi.fn(async () => {});
      const approved = await approveHmFeedbackReminder({
        tenantId: session.tenant_id,
        feedbackRequestId: eligibleItem!.id,
        session,
        addJob,
      });

      expect(approved.status).toBe('queued');
      expect(addJob).toHaveBeenCalledTimes(1);

      // Query the database outbox to verify the transactional event was written
      const events = await db.execute(sql`
        SELECT * FROM core.events 
        WHERE tenant_id = ${session.tenant_id} 
          AND event_type = 'smartrecruit.hm_feedback.reminder_queued'
      `);
      expect(events.rows).toHaveLength(1);
      expect((events.rows[0] as any).aggregate_id).toBe(eligibleItem!.id);
    });
  });
});
