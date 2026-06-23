import { listUsers } from '@seta/identity';
import type { DomainEvent, SubscriberCtx, SubscriberDef } from '@seta/shared-types';
import { requestNotification } from '../domain/request.ts';

interface HmFeedbackReminderQueuedPayload {
  feedbackRequestId: string;
  reminderAttemptId: string;
  stage: 'due_soon' | 'overdue';
}

interface HmFeedbackReminderSentPayload {
  feedbackRequestId: string;
  reminderAttemptId: string;
  providerMessageId: string | null;
}

interface HmFeedbackReminderFailedPayload {
  feedbackRequestId: string;
  reminderAttemptId: string;
  failureCode: string | null;
}

async function getRecruiterUserIds(
  tenantId: string,
  causedByUserId?: string | null,
): Promise<string[]> {
  if (causedByUserId) return [causedByUserId];
  try {
    const { rows } = await listUsers(tenantId, { role_slug: 'recruiter', limit: 50, offset: 0 });
    return rows.map((u) => u.user_id);
  } catch {
    return [];
  }
}

export function smartrecruitHmFeedbackReminderQueuedSubscriber(): SubscriberDef<HmFeedbackReminderQueuedPayload> {
  return {
    subscription: 'notifications.smartrecruit.hm-feedback.reminder-queued',
    event: 'smartrecruit.hm_feedback.reminder_queued',
    eventVersion: 1,
    handler: async (event, _ctx) => {
      const userIds = await getRecruiterUserIds(event.tenantId, event.causedByUserId);
      if (userIds.length === 0) return;

      await requestNotification({
        tenant_id: event.tenantId,
        event_type: 'smartrecruit.hm_feedback.reminder_queued',
        user_ids: userIds,
        source_event_id: event.payload.reminderAttemptId,
        payload: {
          title: 'Hiring Manager reminder queued',
          body: `A ${event.payload.stage} reminder is queued for delivery.`,
          feedbackRequestId: event.payload.feedbackRequestId,
          reminderAttemptId: event.payload.reminderAttemptId,
        },
      });
    },
  };
}

export function smartrecruitHmFeedbackReminderSentSubscriber(): SubscriberDef<HmFeedbackReminderSentPayload> {
  return {
    subscription: 'notifications.smartrecruit.hm-feedback.reminder-sent',
    event: 'smartrecruit.hm_feedback.reminder_sent',
    eventVersion: 1,
    handler: async (event, _ctx) => {
      const userIds = await getRecruiterUserIds(event.tenantId, event.causedByUserId);
      if (userIds.length === 0) return;

      await requestNotification({
        tenant_id: event.tenantId,
        event_type: 'smartrecruit.hm_feedback.reminder_sent',
        user_ids: userIds,
        source_event_id: event.payload.reminderAttemptId,
        payload: {
          title: 'Hiring Manager reminder sent',
          body: 'The reminder has been successfully delivered to the Hiring Manager.',
          feedbackRequestId: event.payload.feedbackRequestId,
          reminderAttemptId: event.payload.reminderAttemptId,
        },
      });
    },
  };
}

export function smartrecruitHmFeedbackReminderFailedSubscriber(): SubscriberDef<HmFeedbackReminderFailedPayload> {
  return {
    subscription: 'notifications.smartrecruit.hm-feedback.reminder-failed',
    event: 'smartrecruit.hm_feedback.reminder_failed',
    eventVersion: 1,
    handler: async (event, _ctx) => {
      const userIds = await getRecruiterUserIds(event.tenantId, event.causedByUserId);
      if (userIds.length === 0) return;

      await requestNotification({
        tenant_id: event.tenantId,
        event_type: 'smartrecruit.hm_feedback.reminder_failed',
        user_ids: userIds,
        source_event_id: event.payload.reminderAttemptId,
        payload: {
          title: 'Hiring Manager reminder failed',
          body: `Delivery failed: ${event.payload.failureCode ?? 'unknown error'}.`,
          feedbackRequestId: event.payload.feedbackRequestId,
          reminderAttemptId: event.payload.reminderAttemptId,
        },
      });
    },
  };
}
