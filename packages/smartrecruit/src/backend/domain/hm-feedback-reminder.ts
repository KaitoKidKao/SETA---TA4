import type { HmFeedbackReminderStage } from './hm-feedback-policy.ts';

export interface HmFeedbackReminderContent {
  subject: string;
  body: string;
}

export function renderHmFeedbackReminder(input: {
  stage: HmFeedbackReminderStage;
  hiringManager: string;
  candidateName: string;
  position: string;
  feedbackDueAt: Date;
}): HmFeedbackReminderContent {
  const deadline = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(input.feedbackDueAt);
  const overdue = input.stage === 'overdue';
  return {
    subject: overdue
      ? `Overdue feedback: ${input.candidateName} — ${input.position}`
      : `Feedback due soon: ${input.candidateName} — ${input.position}`,
    body: [
      `Hello ${input.hiringManager || 'Hiring Manager'},`,
      '',
      overdue
        ? `Your feedback for ${input.candidateName}, shortlisted for ${input.position}, is now overdue.`
        : `Your feedback for ${input.candidateName}, shortlisted for ${input.position}, is due soon.`,
      `Feedback deadline: ${deadline} UTC.`,
      '',
      'Please review the candidate and submit your feedback as soon as possible.',
      '',
      'Thank you,',
      'SmartRecruit',
    ].join('\n'),
  };
}
