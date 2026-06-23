import type { AgentTool } from '@seta/agent-sdk';
import { actorFromContext, defineAgentTool } from '@seta/agent-sdk';
import { buildActorSession } from '@seta/identity';
import { z } from 'zod';
import {
  requirePermission,
  SMARTRECRUIT_HM_FEEDBACK_APPROVE,
  SMARTRECRUIT_OUTREACH_APPROVE,
  SMARTRECRUIT_WRITE,
} from '../rbac.ts';
import { enqueueSmartrecruitJob } from './domain/campaign.ts';
import { draftOutreach } from './domain/draft-outreach.ts';
import { executeOutreach } from './domain/execute-outreach.ts';
import { approveHmFeedbackReminder } from './domain/hm-feedback.ts';
import { performOcr } from './domain/ocr.ts';
import { parseJd } from './domain/parse-jd.ts';
import { screenCv } from './domain/screen-cv.ts';

export const smartrecruitParseJdTool = defineAgentTool({
  id: 'smartrecruit_parseJd',
  name: 'Parse Job Description',
  description:
    'Parse a raw job description to extract structured screening criteria (skills, YOE, education).',
  input: z.object({
    jobTitle: z.string().describe('The title of the job position'),
    jdText: z.string().describe('The raw text of the job description'),
  }),
  output: z.object({
    id: z.string().uuid(),
    jobTitle: z.string(),
    mustHaveSkills: z.array(z.string()),
    niceToHaveSkills: z.array(z.string()),
    minYoe: z.number().int(),
    educationLevel: z.string().nullable(),
    additionalRequirements: z.string().nullable(),
  }),
  rbac: SMARTRECRUIT_WRITE,
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession({ user_id: actor.user_id });
    return parseJd({
      jobTitle: input.jobTitle,
      jdText: input.jdText,
      session,
      abortSignal: ctx.abortSignal,
    });
  },
});

export const smartrecruitScreenCvTool = defineAgentTool({
  id: 'smartrecruit_screenCv',
  name: 'Screen Candidate CV',
  description:
    'Screen a candidate CV text against a set of job criteria. Calculates experience (YOE), matches skills semantically, and returns suitability analysis.',
  input: z.object({
    candidateName: z.string().describe('Full name of the candidate'),
    candidateEmail: z.string().email().describe('Email address of the candidate'),
    candidatePhone: z.string().optional().describe('Phone number of the candidate'),
    cvPath: z.string().optional().describe('Path to the candidate CV PDF file'),
    cvText: z.string().describe('The raw parsed text content of the candidate CV'),
    criteriaId: z.string().uuid().describe('ID of the Job Description criteria in the database'),
  }),
  output: z.object({
    id: z.string().uuid(),
    displayName: z.string(),
    email: z.string(),
    status: z.string(),
    fitScore: z.number(),
    totalYoe: z.number(),
    report: z.object({
      pros: z.array(z.string()),
      gaps: z.array(z.string()),
      yoeExplanation: z.string(),
      overallJustification: z.string(),
      mustHaveMatches: z.array(
        z.object({
          jdSkill: z.string(),
          cvSkill: z.string().nullable(),
          matched: z.boolean(),
          justification: z.string(),
        }),
      ),
      niceToHaveMatches: z.array(
        z.object({
          jdSkill: z.string(),
          cvSkill: z.string().nullable(),
          matched: z.boolean(),
          justification: z.string(),
        }),
      ),
    }),
  }),
  rbac: SMARTRECRUIT_WRITE,
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession({ user_id: actor.user_id });
    return screenCv({
      candidateName: input.candidateName,
      candidateEmail: input.candidateEmail,
      candidatePhone: input.candidatePhone,
      cvPath: input.cvPath,
      cvText: input.cvText,
      criteriaId: input.criteriaId,
      session,
      abortSignal: ctx.abortSignal,
    });
  },
});

export const smartrecruitDraftOutreachTool = defineAgentTool({
  id: 'smartrecruit_draftOutreach',
  name: 'Draft Outreach Email',
  description:
    'Generate a personalized outreach email for a candidate, including anti-hallucination verification.',
  input: z.object({
    candidateId: z.string().uuid().describe('ID of the screened candidate'),
    templateId: z
      .string()
      .uuid()
      .optional()
      .describe('Optional ID of the outreach template to use'),
  }),
  output: z.object({
    id: z.string().uuid(),
    candidateId: z.string().uuid(),
    subject: z.string(),
    body: z.string(),
    hallucinationCheckStatus: z.enum(['passed', 'failed']),
    errorReason: z.string().nullable(),
  }),
  rbac: SMARTRECRUIT_WRITE,
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession({ user_id: actor.user_id });
    return draftOutreach({
      candidateId: input.candidateId,
      templateId: input.templateId,
      session,
      abortSignal: ctx.abortSignal,
    });
  },
});

export const smartrecruitExecuteOutreachTool = defineAgentTool({
  id: 'smartrecruit_executeOutreach',
  name: 'Send Outreach Email',
  description: 'Approve and send the drafted outreach email to the candidate via SMTP.',
  input: z.object({
    draftId: z.string().uuid().describe('ID of the outreach draft to send'),
  }),
  output: z.object({
    id: z.string().uuid(),
    candidateId: z.string().uuid(),
    status: z.string(),
    sentAt: z.string(),
  }),
  rbac: SMARTRECRUIT_OUTREACH_APPROVE,
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession({ user_id: actor.user_id });
    return executeOutreach({
      draftId: input.draftId,
      session,
    });
  },
});

export const smartrecruitApproveHmFeedbackReminderTool = defineAgentTool({
  id: 'smartrecruit_approveHmFeedbackReminder',
  name: 'Approve Hiring Manager Feedback Reminder',
  description:
    'Approve and queue an email reminder to a Hiring Manager for a due-soon or overdue feedback request.',
  input: z.object({
    feedbackRequestId: z.string().uuid().describe('ID of the HM feedback request'),
  }),
  output: z.object({
    id: z.string().uuid(),
    feedbackRequestId: z.string().uuid(),
    status: z.string(),
    queuedAt: z.string().nullable(),
  }),
  rbac: SMARTRECRUIT_HM_FEEDBACK_APPROVE,
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession({ user_id: actor.user_id });
    const attempt = await approveHmFeedbackReminder({
      tenantId: session.tenant_id,
      feedbackRequestId: input.feedbackRequestId,
      session,
      addJob: (taskName, payload, opts) =>
        enqueueSmartrecruitJob(taskName, payload as Record<string, unknown>, opts),
    });
    return {
      id: attempt.id,
      feedbackRequestId: attempt.feedback_request_id,
      status: attempt.status,
      queuedAt: attempt.queued_at?.toISOString() ?? null,
    };
  },
});

export const smartrecruitOcrBackupTool = defineAgentTool({
  id: 'smartrecruit_ocrBackup',
  name: 'OCR Backup Tool',
  description: 'OCR a CV file (PDF or image) using OpenAI Vision or Tesseract as fallback.',
  input: z.object({
    filePath: z.string().describe('The path to the CV file to process'),
  }),
  output: z.object({
    text: z.string().describe('The extracted text content'),
  }),
  rbac: SMARTRECRUIT_WRITE,
  needsApproval: true,
  execute: async (input, ctx) => {
    const actor = actorFromContext(ctx);
    const session = await buildActorSession({ user_id: actor.user_id });
    requirePermission(session, SMARTRECRUIT_WRITE);
    const text = await performOcr(input.filePath);
    return { text };
  },
});

export const smartrecruitAgentTools: AgentTool[] = [
  smartrecruitParseJdTool,
  smartrecruitScreenCvTool,
  smartrecruitDraftOutreachTool,
  smartrecruitExecuteOutreachTool,
  smartrecruitApproveHmFeedbackReminderTool,
  smartrecruitOcrBackupTool,
];
