/**
 * Calendar Scheduler - M365 Outlook Calendar Integration (Phase 3)
 *
 * Uses Microsoft Graph API to:
 * - Check free/busy availability of interviewers
 * - Create interview calendar events with Teams meeting links
 * - Send meeting invitations to candidates and interviewers
 */

import type { Client } from '@microsoft/microsoft-graph-client';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScheduleInterviewInput {
  /** Organizer / interviewer email (must be a user in the M365 tenant) */
  interviewerEmail: string;
  /** Interviewer display name */
  interviewerName?: string;
  /** Candidate email to invite */
  candidateEmail: string;
  /** Candidate display name */
  candidateName: string;
  /** ISO 8601 datetime for the interview start */
  startDateTime: string;
  /** Duration in minutes (default: 60) */
  durationMinutes?: number;
  /** Interview subject line */
  subject?: string;
  /** Additional notes / body content for the invitation */
  body?: string;
  /** Timezone for the event (default: Asia/Ho_Chi_Minh) */
  timeZone?: string;
}

export interface ScheduleInterviewResult {
  /** Microsoft Graph event ID */
  eventId: string;
  /** Teams meeting join URL */
  teamsLink: string | null;
  /** Event web link (Outlook) */
  webLink: string;
  /** Scheduled start time */
  startDateTime: string;
  /** Scheduled end time */
  endDateTime: string;
}

export interface FreeBusySlot {
  /** ISO 8601 start */
  start: string;
  /** ISO 8601 end */
  end: string;
  /** Availability status */
  status: 'free' | 'tentative' | 'busy' | 'oof' | 'workingElsewhere' | 'unknown';
}

export interface GetFreeBusyInput {
  /** Email addresses to check availability for */
  emails: string[];
  /** ISO 8601 datetime for the start of the window */
  startDateTime: string;
  /** ISO 8601 datetime for the end of the window */
  endDateTime: string;
  /** Timezone (default: Asia/Ho_Chi_Minh) */
  timeZone?: string;
  /** Slot interval in minutes (default: 30) */
  intervalMinutes?: number;
}

export interface GetFreeBusyResult {
  /** Map of email -> availability slots */
  schedules: Record<
    string,
    {
      availability: FreeBusySlot[];
      error?: string;
    }
  >;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Create an interview event on the interviewer's Outlook calendar
 * with an auto-generated Teams meeting link.
 */
export async function createInterviewEvent(
  graphClient: Client,
  input: ScheduleInterviewInput,
): Promise<ScheduleInterviewResult> {
  const timeZone = input.timeZone || 'Asia/Ho_Chi_Minh';
  const durationMinutes = input.durationMinutes || 60;

  const startDate = new Date(input.startDateTime);
  const endDate = new Date(startDate.getTime() + durationMinutes * 60 * 1000);

  const subject = input.subject || `Interview: ${input.candidateName} - SmartRecruit`;

  const bodyContent =
    input.body ||
    `<h2>Interview Invitation</h2>
<p>Dear ${input.candidateName},</p>
<p>You have been invited to an interview.</p>
<p><strong>Interviewer:</strong> ${input.interviewerName || input.interviewerEmail}</p>
<p><strong>Date:</strong> ${startDate.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
<p><strong>Time:</strong> ${startDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - ${endDate.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</p>
<p>Please join via the Teams link provided.</p>
<hr/>
<p><em>Scheduled automatically by SETA SmartRecruit</em></p>`;

  const eventPayload = {
    subject,
    body: {
      contentType: 'HTML',
      content: bodyContent,
    },
    start: {
      dateTime: startDate.toISOString(),
      timeZone,
    },
    end: {
      dateTime: endDate.toISOString(),
      timeZone,
    },
    location: {
      displayName: 'Microsoft Teams Meeting',
    },
    attendees: [
      {
        emailAddress: {
          address: input.candidateEmail,
          name: input.candidateName,
        },
        type: 'required' as const,
      },
    ],
    // Enable online meeting (Teams link auto-generation)
    isOnlineMeeting: true,
    onlineMeetingProvider: 'teamsForBusiness',
    // Send invitation emails
    responseRequested: true,
  };

  try {
    const event = await graphClient
      .api(`/users/${input.interviewerEmail}/events`)
      .post(eventPayload);

    const teamsLink: string | null = event.onlineMeeting?.joinUrl || event.onlineMeetingUrl || null;

    return {
      eventId: event.id,
      teamsLink,
      webLink: event.webLink || '',
      startDateTime: event.start?.dateTime || input.startDateTime,
      endDateTime: event.end?.dateTime || endDate.toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CalendarSchedulerError(
      'CREATE_EVENT_FAILED',
      `Failed to create interview event: ${message}`,
    );
  }
}

/**
 * Get free/busy availability for one or more users.
 * Uses Microsoft Graph's getSchedule endpoint.
 */
export async function getFreeBusySlots(
  graphClient: Client,
  input: GetFreeBusyInput,
): Promise<GetFreeBusyResult> {
  const timeZone = input.timeZone || 'Asia/Ho_Chi_Minh';
  const intervalMinutes = input.intervalMinutes || 30;

  const schedulePayload = {
    schedules: input.emails,
    startTime: {
      dateTime: input.startDateTime,
      timeZone,
    },
    endTime: {
      dateTime: input.endDateTime,
      timeZone,
    },
    availabilityViewInterval: intervalMinutes,
  };

  try {
    const response = await graphClient.api('/me/calendar/getSchedule').post(schedulePayload);

    const result: GetFreeBusyResult = { schedules: {} };

    for (const schedule of response.value || []) {
      const email = schedule.scheduleId || '';
      const items: FreeBusySlot[] = [];

      for (const item of schedule.scheduleItems || []) {
        items.push({
          start: item.start?.dateTime || '',
          end: item.end?.dateTime || '',
          status: mapAvailabilityStatus(item.status),
        });
      }

      result.schedules[email] = {
        availability: items,
        error: schedule.error?.message,
      };
    }

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CalendarSchedulerError(
      'GET_SCHEDULE_FAILED',
      `Failed to get free/busy schedule: ${message}`,
    );
  }
}

/**
 * Cancel an existing interview event.
 */
export async function cancelInterviewEvent(
  graphClient: Client,
  interviewerEmail: string,
  eventId: string,
  cancellationMessage?: string,
): Promise<void> {
  try {
    await graphClient.api(`/users/${interviewerEmail}/events/${eventId}/cancel`).post({
      comment: cancellationMessage || 'Interview has been canceled by SmartRecruit.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new CalendarSchedulerError(
      'CANCEL_EVENT_FAILED',
      `Failed to cancel interview event: ${message}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapAvailabilityStatus(status?: string): FreeBusySlot['status'] {
  switch (status) {
    case 'free':
      return 'free';
    case 'tentative':
      return 'tentative';
    case 'busy':
      return 'busy';
    case 'oof':
      return 'oof';
    case 'workingElsewhere':
      return 'workingElsewhere';
    default:
      return 'unknown';
  }
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class CalendarSchedulerError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CalendarSchedulerError';
  }
}
