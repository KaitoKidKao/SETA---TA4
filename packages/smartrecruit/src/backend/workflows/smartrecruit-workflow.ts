import { Agent } from '@mastra/core/agent';
import { createStep } from '@mastra/core/workflows';
import { createWorkflow } from '@mastra/core/workflows/evented';
import {
  ApprovalCardSchema,
  sessionFromRequestContext,
  type WorkflowSpec,
  WorkflowSystemWaitPayloadSchema,
} from '@seta/agent-sdk';
import { withEmit } from '@seta/core/events';
import { buildActorSession } from '@seta/identity';
import { and, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { smartrecruitDb } from '../db/client.ts';
import { criteria as criteriaTable, outreachDrafts } from '../db/schema.ts';
import {
  addCandidatesToCampaign,
  createSmartrecruitCampaign,
  enqueueSmartrecruitJob,
  getCampaignView,
  SmartrecruitCandidateInput,
  SmartrecruitCandidateInputSchema,
  updateCampaignStatus,
  updateCampaignWorkflowRun,
  waitForCampaignStatus,
} from '../domain/campaign.ts';
import { getModelConfig } from '../domain/model.ts';

// --- Input/Output Schemas ---

export const SmartrecruitWorkflowInputSchema = z.object({
  campaignId: z.string().uuid().optional(),
  jobTitle: z.string(),
  jdText: z.string(),
  cvs: z.array(SmartrecruitCandidateInputSchema).default([]),
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
  campaignId: z.string().uuid(),
  criteriaId: z.string().uuid(),
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
      campaignId: z.string().uuid().optional(),
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
      const campaign =
        inputData.campaignId ??
        (
          await createSmartrecruitCampaign({
            jobTitle: inputData.jobTitle,
            jdText: inputData.jdText,
            cvs: inputData.cvs,
            templateId: inputData.templateId,
            session,
          })
        ).campaign.id;

      await updateCampaignWorkflowRun({
        campaignId: campaign,
        tenantId: session.tenant_id,
        workflowRunId: runId,
      });
      await updateCampaignStatus({
        campaignId: campaign,
        tenantId: session.tenant_id,
        status: 'awaiting_criteria',
      });

      const campaignView = await getCampaignView({
        campaignId: campaign,
        tenantId: session.tenant_id,
      });
      if (!campaignView) throw new Error(`Campaign ${campaign} not found.`);
      const jobTitle = campaignView.campaign.job_title;
      const jdText = campaignView.campaign.jd_text;

      // 1. Ask LLM to parse raw Job Description
      const model = getModelConfig();
      const agent = new Agent({
        id: 'smartrecruit.jdParser',
        name: 'Job Description Parser',
        instructions: `You are an expert recruitment coordinator. Analyze the job description for the position of "${jobTitle}".
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
        `Job Title: ${jobTitle}\n\nJob Description:\n${jdText}`,
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
          modelSettings: { temperature: 0, seed: 42 },
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
            job_title: jobTitle,
            jd_text: jdText,
            must_have_skills: parsed.mustHaveSkills,
            nice_to_have_skills: parsed.niceToHaveSkills,
            min_yoe: parsed.minYoe,
            education_level: parsed.educationLevel,
            additional_requirements: parsed.additionalRequirements,
          });
          criteriaId = id;
        },
      );
      await updateCampaignStatus({
        campaignId: campaign,
        tenantId: session.tenant_id,
        status: 'awaiting_criteria',
        criteriaId,
      });

      // 2. Build ApprovalCard for Gate 1
      const card = {
        toolCallId: `workflow:${runId}`,
        intent: 'Confirm screening criteria',
        riskBadge: 'write' as const,
        summary: `Confirm recruitment screening criteria for "${jobTitle}"`,
        details: [
          {
            kind: 'kvTable' as const,
            rows: [
              { k: 'Job Title', v: jobTitle },
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
            campaignId: campaign,
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
    const campaignId = resumeData.campaignId ?? inputData.campaignId;
    if (!campaignId) {
      throw new Error('Campaign ID is required to resume SmartRecruit workflow.');
    }
    const db = smartrecruitDb();
    const [existing] = await db
      .select()
      .from(criteriaTable)
      .where(and(eq(criteriaTable.id, criteriaId), eq(criteriaTable.tenant_id, session.tenant_id)))
      .limit(1);

    if (!existing) {
      throw new Error(`Criteria with ID ${criteriaId} not found on resume.`);
    }

    if (additionalCandidateIds && additionalCandidateIds.length > 0) {
      await addCandidatesToCampaign({
        campaignId,
        tenantId: session.tenant_id,
        candidateIds: additionalCandidateIds,
        source: 'suggested',
      });
    }

    return {
      campaignId,
      criteriaId,
      templateId: inputData.templateId,
    };
  },
});

// --- Step 2: Screen CVs (Calculates Fit Score) ---

const ScreenCvsStepOutputSchema = z.object({
  campaignId: z.string().uuid(),
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

const CampaignStageResumeSchema = z.object({
  kind: z.literal('campaign_stage_completed'),
  campaignId: z.string().uuid(),
  stage: z.enum(['screening', 'drafting', 'sending']),
  status: z.enum([
    'screening_completed',
    'awaiting_outreach_approval',
    'completed',
    'completed_with_errors',
  ]),
});

const screenCvsStep = createStep({
  id: 'smartrecruit.screenCvs',
  description: 'Screens all candidate CVs against the confirmed criteria and saves results.',
  inputSchema: ParseJdStepOutputSchema,
  outputSchema: ScreenCvsStepOutputSchema,
  suspendSchema: WorkflowSystemWaitPayloadSchema,
  resumeSchema: CampaignStageResumeSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });

    const initialView = await getCampaignView({
      campaignId: inputData.campaignId,
      tenantId: session.tenant_id,
    });
    if (!initialView) throw new Error(`Campaign ${inputData.campaignId} not found.`);
    if (!resumeData) {
      await enqueueSmartrecruitJob(
        'smartrecruit:campaign_screen',
        {
          campaignId: inputData.campaignId,
          criteriaId: inputData.criteriaId,
          userId: session.user_id,
        },
        {
          jobKey: `smartrecruit:campaign_screen:${inputData.campaignId}`,
          maxAttempts: 3,
          queueName: `smartrecruit:${inputData.campaignId}`,
        },
      );
      if (initialView.campaign.orchestration_version >= 2) {
        return suspend({
          kind: 'system_wait',
          reason: 'candidate_screening',
          aggregateId: inputData.campaignId,
          stage: 'screening',
        });
      }
      await waitForCampaignStatus({
        campaignId: inputData.campaignId,
        tenantId: session.tenant_id,
        statuses: ['screening_completed'],
      });
    } else if (resumeData.stage !== 'screening') {
      throw new Error(`Unexpected campaign stage resume: ${resumeData.stage}`);
    }

    const view = await getCampaignView({
      campaignId: inputData.campaignId,
      tenantId: session.tenant_id,
    });
    if (!view) throw new Error(`Campaign ${inputData.campaignId} not found after screening.`);

    const screenedCandidates = view.candidates.map(({ campaignCandidate, candidate }) => ({
      id: campaignCandidate.candidate_id,
      displayName: candidate?.display_name ?? 'Unknown candidate',
      email: candidate?.email ?? 'unknown@example.com',
      fitScore: campaignCandidate.fit_score ?? 0,
      screeningStatus:
        campaignCandidate.status === 'screening_failed'
          ? ('failed' as const)
          : campaignCandidate.status === 'shortlisted'
            ? ('shortlisted' as const)
            : ('screened' as const),
      errorReason: campaignCandidate.error_reason ?? undefined,
    }));

    const shortlistedCandidates = screenedCandidates.filter(
      (candidate) => candidate.screeningStatus === 'shortlisted',
    );

    return {
      campaignId: inputData.campaignId,
      criteriaId: inputData.criteriaId,
      screenedCandidates,
      shortlistedCandidates,
      templateId: inputData.templateId,
    };
  },
});

// --- Step 3: Draft Outreach Emails (Gate 2 Suspend) ---

const DraftOutreachStepOutputSchema = z.object({
  campaignId: z.string().uuid(),
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
  suspendSchema: z.union([ApprovalCardSchema, WorkflowSystemWaitPayloadSchema]),
  resumeSchema: z.union([Gate2ResumeSchema, Gate2GenericResumeSchema, CampaignStageResumeSchema]),
  execute: async ({ inputData, resumeData, suspend, requestContext, runId }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });
    const stageResume =
      resumeData && 'kind' in resumeData && resumeData.kind === 'campaign_stage_completed';

    if (!resumeData) {
      const campaignBeforeDrafting = await getCampaignView({
        campaignId: inputData.campaignId,
        tenantId: session.tenant_id,
      });
      if (!campaignBeforeDrafting) throw new Error(`Campaign ${inputData.campaignId} not found.`);
      await enqueueSmartrecruitJob(
        'smartrecruit:campaign_draft_outreach',
        {
          campaignId: inputData.campaignId,
          templateId: inputData.templateId,
          userId: session.user_id,
        },
        {
          jobKey: `smartrecruit:campaign_draft_outreach:${inputData.campaignId}`,
          maxAttempts: 3,
          queueName: `smartrecruit:${inputData.campaignId}`,
        },
      );

      if (campaignBeforeDrafting.campaign.orchestration_version >= 2) {
        return suspend({
          kind: 'system_wait',
          reason: 'outreach_drafting',
          aggregateId: inputData.campaignId,
          stage: 'drafting',
        });
      }

      await waitForCampaignStatus({
        campaignId: inputData.campaignId,
        tenantId: session.tenant_id,
        statuses: ['awaiting_outreach_approval'],
      });
    }

    if (!resumeData || stageResume) {
      const view = await getCampaignView({
        campaignId: inputData.campaignId,
        tenantId: session.tenant_id,
      });
      if (!view) throw new Error(`Campaign ${inputData.campaignId} not found after drafting.`);

      // Build ApprovalCard for Gate 2
      const screenedCandidates = view.candidates.map(({ campaignCandidate, candidate, draft }) => ({
        id: campaignCandidate.candidate_id,
        displayName: candidate?.display_name ?? 'Unknown candidate',
        email: candidate?.email ?? 'unknown@example.com',
        fitScore: campaignCandidate.fit_score ?? 0,
        status: campaignCandidate.status,
        errorReason: campaignCandidate.error_reason ?? undefined,
        draft,
      }));
      const screenedCount = screenedCandidates.length;
      const shortlistedCount = screenedCandidates.filter((c) =>
        [
          'shortlisted',
          'drafting',
          'drafted',
          'draft_failed',
          'sending',
          'sent',
          'send_failed',
        ].includes(c.status),
      ).length;
      const draftedCandidates = screenedCandidates.filter((c) => c.draft);
      const card = {
        toolCallId: `workflow:${runId}`,
        intent: 'Approve outreach emails',

        riskBadge: 'external' as const,
        summary:
          shortlistedCount > 0
            ? `Review ${draftedCandidates.length} generated outreach drafts for ${shortlistedCount} shortlisted candidates (${screenedCount} screened total)`
            : `Review screening results for ${screenedCount} candidates. No outreach draft was generated because no candidate met the shortlist threshold.`,
        details: [
          {
            kind: 'candidateList' as const,
            items: screenedCandidates.map((c) => {
              const statusLabel =
                c.status === 'screening_failed'
                  ? `Screening failed: ${c.errorReason ?? 'Unknown error'}`
                  : c.status === 'draft_failed'
                    ? `Score: ${c.fitScore}% | Draft failed: ${c.errorReason ?? 'Unknown error'}`
                    : c.draft
                      ? `Score: ${c.fitScore}% | Draft: Anti-Hallucination ${c.draft.hallucination_check_status}`
                      : c.status === 'shortlisted'
                        ? `Score: ${c.fitScore}% | Draft: ${
                            c.errorReason ? `failed (${c.errorReason})` : 'not generated'
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
            approvedDraftIds: draftedCandidates
              .map((candidate) => candidate.draft?.id)
              .filter(Boolean),
            assigneeUserIds: draftedCandidates.map((candidate) => candidate.id),
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
      await updateCampaignStatus({
        campaignId: inputData.campaignId,
        tenantId: session.tenant_id,
        status: 'canceled',
      });
      return { campaignId: inputData.campaignId, approvedDraftIds: [] };
    }

    const explicitDraftIds =
      'approvedDraftIds' in resumeData && Array.isArray(resumeData.approvedDraftIds)
        ? (resumeData.approvedDraftIds as string[])
        : [];
    if (explicitDraftIds.length > 0) {
      return { campaignId: inputData.campaignId, approvedDraftIds: explicitDraftIds };
    }

    const candidateIds =
      'assigneeUserIds' in resumeData && Array.isArray(resumeData.assigneeUserIds)
        ? (resumeData.assigneeUserIds as string[])
        : inputData.shortlistedCandidates.map((candidate) => candidate.id);

    if (candidateIds.length === 0) {
      return { campaignId: inputData.campaignId, approvedDraftIds: [] };
    }

    const db = smartrecruitDb();
    const rows = await db
      .select({ id: outreachDrafts.id })
      .from(outreachDrafts)
      .where(
        and(
          eq(outreachDrafts.tenant_id, session.tenant_id),
          eq(outreachDrafts.campaign_id, inputData.campaignId),
          inArray(outreachDrafts.candidate_id, candidateIds),
          eq(outreachDrafts.status, 'draft'),
        ),
      );

    return {
      campaignId: inputData.campaignId,
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
  suspendSchema: WorkflowSystemWaitPayloadSchema,
  resumeSchema: CampaignStageResumeSchema,
  execute: async ({ inputData, resumeData, suspend, requestContext }) => {
    const { userId } = await sessionFromRequestContext(requestContext);
    const session = await buildActorSession({ user_id: userId });

    const beforeSending = await getCampaignView({
      campaignId: inputData.campaignId,
      tenantId: session.tenant_id,
    });
    if (!beforeSending) throw new Error(`Campaign ${inputData.campaignId} not found.`);
    let campaign = beforeSending.campaign;
    if (!resumeData) {
      await enqueueSmartrecruitJob(
        'smartrecruit:campaign_send_outreach',
        {
          campaignId: inputData.campaignId,
          userId: session.user_id,
          approvedDraftIds: inputData.approvedDraftIds,
        },
        {
          jobKey: `smartrecruit:campaign_send_outreach:${inputData.campaignId}`,
          maxAttempts: 3,
          queueName: `smartrecruit:${inputData.campaignId}`,
        },
      );
      if (campaign.orchestration_version >= 2) {
        return suspend({
          kind: 'system_wait',
          reason: 'outreach_sending',
          aggregateId: inputData.campaignId,
          stage: 'sending',
        });
      }
      campaign = await waitForCampaignStatus({
        campaignId: inputData.campaignId,
        tenantId: session.tenant_id,
        statuses: ['completed', 'completed_with_errors'],
      });
    } else if (resumeData.stage === 'sending') {
      const completed = await getCampaignView({
        campaignId: inputData.campaignId,
        tenantId: session.tenant_id,
      });
      if (!completed) throw new Error(`Campaign ${inputData.campaignId} not found after sending.`);
      campaign = completed.campaign;
    } else {
      throw new Error(`Unexpected campaign stage resume: ${resumeData.stage}`);
    }

    return {
      success: campaign.failed_count === 0,
      count: campaign.sent_count,
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
