import { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { createWorkflow } from '@mastra/core/workflows/evented';
import { ApprovalCardSchema, sessionFromRequestContext, type WorkflowSpec } from '@seta/agent-sdk';
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { buildActorSession } from '@seta/identity';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, criteria as criteriaTable, outreachDrafts } from '../db/schema.ts';
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
      additionalCandidateIds: z.array(z.string().uuid()).optional(),
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

    const { criteriaId, additionalCandidateIds } = resumeData;
    const db = smartrecruitDb();
    const [existing] = await db
      .select()
      .from(criteriaTable)
      .where(and(eq(criteriaTable.id, criteriaId), eq(criteriaTable.tenant_id, session.tenant_id)))
      .limit(1);

    if (!existing) {
      throw new Error(`Criteria with ID ${criteriaId} not found on resume.`);
    }

    let additionalCvs: Array<{
      candidateName: string;
      candidateEmail: string;
      candidatePhone?: string;
      cvPath?: string;
      cvText: string;
    }> = [];

    if (additionalCandidateIds && additionalCandidateIds.length > 0) {
      const dbCands = await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.tenant_id, session.tenant_id),
            inArray(candidates.id, additionalCandidateIds),
          ),
        );
      additionalCvs = dbCands.map((c) => ({
        candidateName: c.display_name,
        candidateEmail: c.email,
        candidatePhone: c.phone ?? undefined,
        cvPath: c.cv_path ?? undefined,
        cvText: c.cv_text ?? '',
      }));
    }

    return {
      criteriaId,
      cvs: [...inputData.cvs, ...additionalCvs],
      templateId: inputData.templateId,
    };
  },
});

// --- Helper for Concurrent Batch Processing ---

async function runInBatchesSettled<T, R>(
  items: T[],
  batchSize: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results: Array<PromiseSettledResult<R>> = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const chunk = items.slice(i, i + batchSize);
    const chunkResults = await Promise.allSettled(chunk.map((item) => fn(item)));
    results.push(...chunkResults);
  }
  return results;
}

type WorkflowCandidateSummary = {
  id: string;
  displayName: string;
  email: string;
  fitScore: number;
  screeningStatus: 'screened' | 'shortlisted' | 'failed';
  errorReason?: string;
};

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function toWorkflowCandidateSummary(
  screened: Awaited<ReturnType<typeof screenCv>>,
): WorkflowCandidateSummary {
  return {
    id: screened.id,
    displayName: screened.displayName,
    email: screened.email,
    fitScore: screened.fitScore,
    screeningStatus: screened.fitScore >= 70 ? 'shortlisted' : 'screened',
  };
}

async function saveFailedScreeningCandidate(args: {
  cv: z.infer<typeof SmartrecruitCandidateInputSchema>;
  session: SessionScope;
  error: unknown;
}): Promise<WorkflowCandidateSummary> {
  const message = messageFromError(args.error);
  const report = {
    pros: [],
    gaps: [`Screening failed: ${message}`],
    yoeExplanation: 'Unable to calculate years of experience because screening failed.',
    overallJustification:
      'The automated screening step failed for this CV. Keep this candidate for manual recruiter review instead of dropping them from the pipeline.',
    mustHaveMatches: [],
    niceToHaveMatches: [],
    scoreBreakdown: {
      mustHaveSkills: 0,
      yoe: 0,
      english: 0,
      niceToHave: 0,
    },
    flags: ['SCREENING_FAILED'],
  };

  let savedId!: string;
  await withEmit(
    {
      actor: {
        userId: args.session.user_id,
        tenantId: args.session.tenant_id,
      },
    },
    async (tx) => {
      const id = crypto.randomUUID();
      await tx.insert(candidates).values({
        id,
        tenant_id: args.session.tenant_id,
        display_name: args.cv.candidateName,
        email: args.cv.candidateEmail,
        phone: args.cv.candidatePhone ?? null,
        cv_path: args.cv.cvPath ?? null,
        cv_text: args.cv.cvText,
        status: 'screened',
        fit_score: 0,
        screening_report: report,
      });
      savedId = id;
    },
  );

  return {
    id: savedId,
    displayName: args.cv.candidateName,
    email: args.cv.candidateEmail,
    fitScore: 0,
    screeningStatus: 'failed',
    errorReason: message,
  };
}

async function markOutreachDraftFailed(args: {
  draftId: string;
  session: SessionScope;
  error: unknown;
}): Promise<void> {
  const message = messageFromError(args.error);
  await withEmit(
    {
      actor: {
        userId: args.session.user_id,
        tenantId: args.session.tenant_id,
      },
    },
    async (tx) => {
      await tx
        .update(outreachDrafts)
        .set({
          status: 'failed',
          error_reason: message,
          updated_at: new Date(),
        })
        .where(
          and(
            eq(outreachDrafts.id, args.draftId),
            eq(outreachDrafts.tenant_id, args.session.tenant_id),
          ),
        );
    },
  );
}

// --- Step 2: Screen CVs (Calculates Fit Score) ---

const ScreenCvsStepOutputSchema = z.object({
  criteriaId: z.string().uuid(),
  screenedCandidates: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      email: z.string().email(),
      fitScore: z.number(),
      screeningStatus: z.enum(['screened', 'shortlisted', 'failed']),
      errorReason: z.string().optional(),
    }),
  ),
  shortlistedCandidates: z.array(
    z.object({
      id: z.string().uuid(),
      displayName: z.string(),
      email: z.string().email(),
      fitScore: z.number(),
      screeningStatus: z.enum(['screened', 'shortlisted', 'failed']).optional(),
      errorReason: z.string().optional(),
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

    const settledResults = await runInBatchesSettled(inputData.cvs, 3, (cv) =>
      screenCv({
        candidateName: cv.candidateName,
        candidateEmail: cv.candidateEmail,
        candidatePhone: cv.candidatePhone,
        cvPath: cv.cvPath,
        cvText: cv.cvText,
        criteriaId: inputData.criteriaId,
        session,
      }),
    );

    const screenedCandidates: WorkflowCandidateSummary[] = [];
    for (let index = 0; index < settledResults.length; index++) {
      const settled = settledResults[index];
      const cv = inputData.cvs[index];
      if (!settled || !cv) continue;

      if (settled.status === 'fulfilled') {
        screenedCandidates.push(toWorkflowCandidateSummary(settled.value));
      } else {
        screenedCandidates.push(
          await saveFailedScreeningCandidate({
            cv,
            session,
            error: settled.reason,
          }),
        );
      }
    }

    const shortlistedCandidates = screenedCandidates.filter(
      (candidate) => candidate.screeningStatus === 'shortlisted',
    );

    return {
      criteriaId: inputData.criteriaId,
      screenedCandidates,
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
    approvedDraftIds: z.array(z.string().uuid()).optional(),
    assigneeUserIds: z.array(z.string().uuid()).optional(),
  }),
  z.object({
    action: z.literal('decline'),
  }),
]);

const Gate2GenericResumeSchema = z.object({
  decision: z.enum(['approve', 'reject', 'modify', 'timeout']),
  approvedDraftIds: z.array(z.string().uuid()).optional(),
  assigneeUserIds: z.array(z.string().uuid()).optional(),
});

const draftOutreachStep = createStep({
  id: 'smartrecruit.draftOutreach',
  description:
    'Drafts outreach emails for shortlisted candidates with anti-hallucination checks, and suspends for Gate 2 human approval.',
  inputSchema: ScreenCvsStepOutputSchema,
  outputSchema: DraftOutreachStepOutputSchema,
  suspendSchema: ApprovalCardSchema,
  resumeSchema: z.union([Gate2ResumeSchema, Gate2GenericResumeSchema]),
  execute: async ({ inputData, resumeData, suspend, requestContext, runId }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });

    if (!resumeData) {
      const draftSettled = await runInBatchesSettled(inputData.shortlistedCandidates, 3, (cand) =>
        draftOutreach({
          candidateId: cand.id,
          templateId: inputData.templateId,
          session,
        }),
      );

      const draftResults: Array<Awaited<ReturnType<typeof draftOutreach>>> = [];
      const draftFailures = new Map<string, string>();
      for (let index = 0; index < draftSettled.length; index++) {
        const settled = draftSettled[index];
        const candidate = inputData.shortlistedCandidates[index];
        if (!settled || !candidate) continue;
        if (settled.status === 'fulfilled') {
          draftResults.push(settled.value);
        } else {
          const message = messageFromError(settled.reason);
          draftFailures.set(candidate.id, message);
        }
      }

      // Build ApprovalCard for Gate 2
      const screenedCount = inputData.screenedCandidates.length;
      const shortlistedCount = inputData.shortlistedCandidates.length;
      const card = {
        toolCallId: `workflow:${runId}`,
        intent: 'Approve outreach emails',

        riskBadge: 'external' as const,
        summary:
          shortlistedCount > 0
            ? `Review ${draftResults.length} generated outreach drafts for ${shortlistedCount} shortlisted candidates (${screenedCount} screened total)`
            : `Review screening results for ${screenedCount} candidates. No outreach draft was generated because no candidate met the shortlist threshold.`,
        details: [
          {
            kind: 'candidateList' as const,
            items: inputData.screenedCandidates.map((c) => {
              const draft = draftResults.find((d) => d.candidateId === c.id);
              const draftFailure = draftFailures.get(c.id);
              const statusLabel =
                c.screeningStatus === 'failed'
                  ? `Screening failed: ${c.errorReason ?? 'Unknown error'}`
                  : c.screeningStatus === 'shortlisted'
                    ? `Score: ${c.fitScore}% | Draft: ${
                        draft
                          ? `Anti-Hallucination ${draft.hallucinationCheckStatus}`
                          : draftFailure
                            ? `failed (${draftFailure})`
                            : 'not generated'
                      }`
                    : `Score: ${c.fitScore}% | Below outreach threshold, keep for manual review`;
              return {
                id: c.id,
                label: c.displayName,
                secondary: statusLabel,
                score: c.fitScore / 100,
              };
            }),
          },
        ],
        primary: {
          label: 'Approve & Send',
          argsPatch: {
            action: 'approve',
            approvedDraftIds: draftResults.map((d) => d.id),
            assigneeUserIds: draftResults.map((draft) => draft.candidateId),
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

    // When resumed (Gate 2 confirmed). The agent approval route normally
    // translates ApprovalCard.primary.argsPatch into { action, approvedDraftIds }.
    // Older/lossy lifecycle events can resume with only { decision: "approve" },
    // so support both shapes defensively.
    const declined =
      ('action' in resumeData && resumeData.action === 'decline') ||
      ('decision' in resumeData &&
        (resumeData.decision === 'reject' || resumeData.decision === 'timeout'));

    if (declined) {
      return { approvedDraftIds: [] };
    }

    const explicitDraftIds =
      'approvedDraftIds' in resumeData && Array.isArray(resumeData.approvedDraftIds)
        ? (resumeData.approvedDraftIds as string[])
        : [];
    if (explicitDraftIds.length > 0) {
      return { approvedDraftIds: explicitDraftIds };
    }

    const candidateIds =
      'assigneeUserIds' in resumeData && Array.isArray(resumeData.assigneeUserIds)
        ? (resumeData.assigneeUserIds as string[])
        : inputData.shortlistedCandidates.map((candidate) => candidate.id);

    if (candidateIds.length === 0) return { approvedDraftIds: [] };

    const db = smartrecruitDb();
    const rows = await db
      .select({ id: outreachDrafts.id })
      .from(outreachDrafts)
      .where(
        and(
          eq(outreachDrafts.tenant_id, session.tenant_id),
          inArray(outreachDrafts.candidate_id, candidateIds),
          eq(outreachDrafts.status, 'draft'),
        ),
      );

    return {
      approvedDraftIds: rows.map((row) => row.id),
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

    const sendResults = await runInBatchesSettled(inputData.approvedDraftIds, 2, (draftId) =>
      executeOutreach({
        draftId,
        session,
      }),
    );

    let sentCount = 0;
    for (let index = 0; index < sendResults.length; index++) {
      const result = sendResults[index];
      const draftId = inputData.approvedDraftIds[index];
      if (!result || !draftId) continue;

      if (result.status === 'fulfilled') {
        sentCount += 1;
      } else {
        await markOutreachDraftFailed({
          draftId,
          session,
          error: result.reason,
        });
      }
    }

    return {
      success: sentCount === inputData.approvedDraftIds.length,
      count: sentCount,
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
