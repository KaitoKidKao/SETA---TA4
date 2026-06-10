import { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { createWorkflow } from '@mastra/core/workflows/evented';
import { ApprovalCardSchema, sessionFromRequestContext, type WorkflowSpec } from '@seta/agent-sdk';
import { withEmit } from '@seta/core/events';
import { buildActorSession } from '@seta/identity';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { smartrecruitDb } from '../db/client.ts';
import { criteria as criteriaTable } from '../db/schema.ts';
import { draftOutreach } from '../domain/draft-outreach.ts';
import { executeOutreach } from '../domain/execute-outreach.ts';
import { getModelConfig } from '../domain/model.ts';
import { screenCv } from '../domain/screen-cv.ts';

// --- Input/Output Schemas ---

export const SmartrecruitCandidateInputSchema = z.object({
  candidateName: z.string(),
  candidateEmail: z.string().email(),
  candidatePhone: z.string().optional(),
  cvPath: z.string().optional(),
  cvText: z.string(),
});

export const SmartrecruitWorkflowInputSchema = z.object({
  jobTitle: z.string(),
  jdText: z.string(),
  cvs: z.array(SmartrecruitCandidateInputSchema),
  templateId: z.string().uuid().optional(),
});
export type SmartrecruitWorkflowInput = z.infer<typeof SmartrecruitWorkflowInputSchema>;

export const SmartrecruitWorkflowOutputSchema = z.object({
  success: z.boolean(),
  count: z.number(),
});
export type SmartrecruitWorkflowOutput = z.infer<typeof SmartrecruitWorkflowOutputSchema>;

// --- Step 1: Parse JD (Gate 1 Suspend) ---

const ParseJdStepOutputSchema = z.object({
  criteriaId: z.string().uuid(),
  cvs: z.array(SmartrecruitCandidateInputSchema),
  templateId: z.string().uuid().optional(),
});

const _Gate1ResumeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    confirmedCriteria: z.object({
      jobTitle: z.string(),
      jdText: z.string(),
      mustHaveSkills: z.array(z.string()),
      niceToHaveSkills: z.array(z.string()),
      minYoe: z.number().int(),
      educationLevel: z.string().nullable(),
      additionalRequirements: z.string().nullable(),
    }),
  }),
  z.object({
    action: z.literal('decline'),
  }),
]);

const parseJdStep = createStep({
  id: 'smartrecruit.parseJd',
  description:
    'Parses the job description, proposes criteria, and suspends for Gate 1 human approval.',
  inputSchema: SmartrecruitWorkflowInputSchema,
  outputSchema: ParseJdStepOutputSchema,
  suspendSchema: ApprovalCardSchema,
  resumeSchema: z.discriminatedUnion('action', [
    z.object({
      action: z.literal('approve'),
      criteriaId: z.string().uuid(),
    }),
    z.object({
      action: z.literal('decline'),
    }),
  ]),
  execute: async ({ inputData, resumeData, suspend, requestContext, runId }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });

    if (!resumeData) {
      // 1. Ask LLM to parse raw Job Description
      const model = getModelConfig();
      const agent = new Agent({
        id: 'smartrecruit.jdParser',
        name: 'Job Description Parser',
        instructions: `You are an expert recruitment coordinator. Analyze the job description for the position of "${inputData.jobTitle}".
Extract:
1. Must-have technical skills: skills absolutely required.
2. Nice-to-have technical skills: preferred or optional skills.
3. Minimum years of experience (integer).
4. Minimum education level needed.
5. Additional requirements (e.g. communication skills, languages).
Return the result structured according to the schema.`,
        model,
      });

      const response = await agent.generate(
        `Job Title: ${inputData.jobTitle}\n\nJob Description:\n${inputData.jdText}`,
        {
          structuredOutput: {
            schema: z.object({
              mustHaveSkills: z.array(z.string()).describe('List of must-have technical skills'),
              niceToHaveSkills: z
                .array(z.string())
                .describe('List of nice-to-have technical skills'),
              minYoe: z.number().int().default(0).describe('Minimum years of experience required'),
              educationLevel: z
                .string()
                .nullable()
                .describe('Required education level, e.g. Bachelor'),
              additionalRequirements: z
                .string()
                .nullable()
                .describe('Additional notes or soft skill requirements'),
            }),
          },
        },
      );

      const parsed = response.object;
      if (!parsed) {
        throw new Error('Failed to parse Job Description. LLM returned empty result.');
      }

      // Save criteria proposal to database as draft
      let criteriaId!: string;
      await withEmit(
        {
          actor: {
            userId: session.user_id,
            tenantId: session.tenant_id,
          },
        },
        async (tx) => {
          const id = crypto.randomUUID();
          await tx.insert(criteriaTable).values({
            id,
            tenant_id: session.tenant_id,
            job_title: inputData.jobTitle,
            jd_text: inputData.jdText,
            must_have_skills: parsed.mustHaveSkills,
            nice_to_have_skills: parsed.niceToHaveSkills,
            min_yoe: parsed.minYoe,
            education_level: parsed.educationLevel,
            additional_requirements: parsed.additionalRequirements,
          });
          criteriaId = id;
        },
      );

      // 2. Build ApprovalCard for Gate 1
      const card = {
        toolCallId: `workflow:${runId}`,
        intent: 'Confirm screening criteria',
        riskBadge: 'write' as const,
        summary: `Confirm recruitment screening criteria for "${inputData.jobTitle}"`,
        details: [
          {
            kind: 'kvTable' as const,
            rows: [
              { k: 'Job Title', v: inputData.jobTitle },
              { k: 'Minimum YOE', v: `${parsed.minYoe} years` },
              { k: 'Education Level', v: parsed.educationLevel ?? 'Not specified' },
              { k: 'Additional Requirements', v: parsed.additionalRequirements ?? 'None' },
            ],
          },
          {
            kind: 'confirmationChecklist' as const,
            items: [
              ...parsed.mustHaveSkills.map((s) => `Must Have: ${s}`),
              ...parsed.niceToHaveSkills.map((s) => `Nice to Have: ${s}`),
            ],
          },
        ],
        primary: {
          label: 'Confirm Criteria',
          argsPatch: {
            action: 'approve',
            criteriaId,
          },
        },
        alternates: [],
        decline: {
          label: 'Decline',
          argsPatch: {
            action: 'decline',
          },
        },
        meta: {
          tenantId: session.tenant_id,
          userId: session.user_id,
          agentPath: ['smartrecruit'],
          toolId: 'smartrecruit_parseJd',
          ts: new Date().toISOString(),
        },
      };

      return suspend(card);
    }

    // When resumed (Gate 1 confirmed)
    if (resumeData.action === 'decline') {
      throw new Error('Workflow run was declined at Gate 1: Criteria confirmation.');
    }

    const { criteriaId } = resumeData;
    const db = smartrecruitDb();
    const [existing] = await db
      .select()
      .from(criteriaTable)
      .where(and(eq(criteriaTable.id, criteriaId), eq(criteriaTable.tenant_id, session.tenant_id)))
      .limit(1);

    if (!existing) {
      throw new Error(`Criteria with ID ${criteriaId} not found on resume.`);
    }

    return {
      criteriaId,
      cvs: inputData.cvs,
      templateId: inputData.templateId,
    };
  },
});

// --- Step 2: Screen CVs (Calculates Fit Score) ---

const ScreenCvsStepOutputSchema = z.object({
  criteriaId: z.string().uuid(),
  shortlistedCandidates: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      email: z.string(),
      fitScore: z.number(),
    }),
  ),
  templateId: z.string().uuid().optional(),
});

const screenCvsStep = createStep({
  id: 'smartrecruit.screenCvs',
  description: 'Screens all candidate CVs against the confirmed criteria and saves results.',
  inputSchema: ParseJdStepOutputSchema,
  outputSchema: ScreenCvsStepOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });

    const shortlistedCandidates: Array<{
      id: string;
      displayName: string;
      email: string;
      fitScore: number;
    }> = [];

    for (const cv of inputData.cvs) {
      const screened = await screenCv({
        candidateName: cv.candidateName,
        candidateEmail: cv.candidateEmail,
        candidatePhone: cv.candidatePhone,
        cvPath: cv.cvPath,
        cvText: cv.cvText,
        criteriaId: inputData.criteriaId,
        session,
      });

      // Filter: Shortlisted if fitScore >= 70
      if (screened.fitScore >= 70) {
        shortlistedCandidates.push({
          id: screened.id,
          displayName: screened.displayName,
          email: screened.email,
          fitScore: screened.fitScore,
        });
      }
    }

    return {
      criteriaId: inputData.criteriaId,
      shortlistedCandidates,
      templateId: inputData.templateId,
    };
  },
});

// --- Step 3: Draft Outreach Emails (Gate 2 Suspend) ---

const DraftOutreachStepOutputSchema = z.object({
  approvedDraftIds: z.array(z.string().uuid()),
});

const Gate2ResumeSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('approve'),
    approvedDraftIds: z.array(z.string().uuid()),
  }),
  z.object({
    action: z.literal('decline'),
  }),
]);

const draftOutreachStep = createStep({
  id: 'smartrecruit.draftOutreach',
  description:
    'Drafts outreach emails for shortlisted candidates with anti-hallucination checks, and suspends for Gate 2 human approval.',
  inputSchema: ScreenCvsStepOutputSchema,
  outputSchema: DraftOutreachStepOutputSchema,
  suspendSchema: ApprovalCardSchema,
  resumeSchema: Gate2ResumeSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext, runId }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });

    if (!resumeData) {
      const draftResults: any[] = [];
      for (const cand of inputData.shortlistedCandidates) {
        const draft = await draftOutreach({
          candidateId: cand.id,
          templateId: inputData.templateId,
          session,
        });
        draftResults.push(draft);
      }

      // If no candidate got shortlisted/drafted, terminate without suspension
      if (draftResults.length === 0) {
        return { approvedDraftIds: [] };
      }

      // Build ApprovalCard for Gate 2
      const card = {
        toolCallId: `workflow:${runId}`,
        intent: 'Approve outreach emails',
        riskBadge: 'external' as const,
        summary: `Review and approve personalized outreach emails for ${draftResults.length} shortlisted candidates`,
        details: [
          {
            kind: 'candidateList' as const,
            items: inputData.shortlistedCandidates.map((c) => {
              const draft = draftResults.find((d) => d.candidateId === c.id);
              return {
                id: draft?.id ?? c.id,
                label: c.displayName,
                secondary: `Score: ${c.fitScore}% | Anti-Hallucination: ${draft?.hallucinationCheckStatus ?? 'unknown'}`,
                score: c.fitScore,
              };
            }),
          },
        ],
        primary: {
          label: 'Approve & Send',
          argsPatch: {
            action: 'approve',
            approvedDraftIds: draftResults.map((d) => d.id),
          },
        },
        alternates: [],
        decline: {
          label: 'Decline',
          argsPatch: {
            action: 'decline',
          },
        },
        meta: {
          tenantId: session.tenant_id,
          userId: session.user_id,
          agentPath: ['smartrecruit'],
          toolId: 'smartrecruit_draftOutreach',
          ts: new Date().toISOString(),
        },
      };

      return suspend(card);
    }

    // When resumed (Gate 2 confirmed)
    if (resumeData.action === 'decline') {
      throw new Error('Workflow run was declined at Gate 2: Outreach email approval.');
    }

    return {
      approvedDraftIds: resumeData.approvedDraftIds,
    };
  },
});

// --- Step 4: Execute Outreach (Sends Emails) ---

const executeOutreachStep = createStep({
  id: 'smartrecruit.executeOutreach',
  description: 'Sends the approved outreach emails via SMTP and updates statuses.',
  inputSchema: DraftOutreachStepOutputSchema,
  outputSchema: SmartrecruitWorkflowOutputSchema,
  execute: async ({ inputData, requestContext }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });

    for (const draftId of inputData.approvedDraftIds) {
      await executeOutreach({
        draftId,
        session,
      });
    }

    return {
      success: true,
      count: inputData.approvedDraftIds.length,
    };
  },
});

// --- Workflow & Spec Registration ---

export const smartrecruitWorkflow = createWorkflow({
  id: 'smartrecruit.workflow',
  inputSchema: SmartrecruitWorkflowInputSchema,
  outputSchema: SmartrecruitWorkflowOutputSchema,
})
  .then(parseJdStep)
  .then(screenCvsStep)
  .then(draftOutreachStep)
  .then(executeOutreachStep)
  .commit();

export const smartrecruitWorkflowSpec: WorkflowSpec = {
  domain: 'people',
  id: 'smartrecruit',
  description:
    'Dual-Gate recruitment workflow: JD criteria parser, candidate CV screening/shortlisting, personalized outreach email drafting (with anti-hallucination verification), and final SMTP dispatch.',
  inputSchema: SmartrecruitWorkflowInputSchema,
  outputSchema: SmartrecruitWorkflowOutputSchema,
  workflow: smartrecruitWorkflow,
  hitlSteps: ['smartrecruit.parseJd', 'smartrecruit.draftOutreach'],
};
