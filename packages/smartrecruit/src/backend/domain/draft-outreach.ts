import { Agent } from '@mastra/core/agent';
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, outreachDrafts, outreachTemplates } from '../db/schema.ts';
import { getModelConfig } from './model.ts';

export interface DraftOutreachInput {
  candidateId: string;
  templateId?: string;
  session: SessionScope;
  abortSignal?: AbortSignal;
}

export interface DraftOutreachOutput {
  id: string;
  candidateId: string;
  subject: string;
  body: string;
  hallucinationCheckStatus: 'passed' | 'failed';
  errorReason: string | null;
}

export async function draftOutreach(input: DraftOutreachInput): Promise<DraftOutreachOutput> {
  requirePermission(input.session, SMARTRECRUIT_WRITE);

  const db = smartrecruitDb();

  // 1. Fetch candidate
  const [cand] = await db
    .select()
    .from(candidates)
    .where(
      and(eq(candidates.id, input.candidateId), eq(candidates.tenant_id, input.session.tenant_id)),
    )
    .limit(1);

  if (!cand) {
    throw new Error(`Candidate with ID ${input.candidateId} not found.`);
  }

  // 2. Fetch template
  let templ: typeof outreachTemplates.$inferSelect | undefined;
  if (input.templateId) {
    const [t] = await db
      .select()
      .from(outreachTemplates)
      .where(
        and(
          eq(outreachTemplates.id, input.templateId),
          eq(outreachTemplates.tenant_id, input.session.tenant_id),
        ),
      )
      .limit(1);
    templ = t;
  } else {
    const [t] = await db
      .select()
      .from(outreachTemplates)
      .where(eq(outreachTemplates.tenant_id, input.session.tenant_id))
      .limit(1);
    templ = t;
  }

  // Fallback default template if none configured/seeded in DB
  const subjectTemplate =
    templ?.subject_template ?? 'Career opportunities at SETA for {{candidateName}}';
  const bodyTemplate =
    templ?.body_template ??
    `Hi {{candidateName}},

We reviewed your impressive background and your experience with {{skills}}. We would love to discuss a potential fit at SETA.

Looking forward to your reply.
Best regards,
SETA Recruitment Team`;

  const model = getModelConfig();

  // Helper function for generation
  const generateDraft = async (temp: number, warning?: string) => {
    const agent = new Agent({
      id: 'smartrecruit.outreachDrafter',
      name: 'Outreach Drafter',
      instructions: `You are an expert recruitment outreach coordinator.
You need to draft a professional, engaging outreach email to a candidate based on an email template and the candidate's CV.
Customize the email:
1. Ground it in the candidate's actual experience.
2. Reference prominent projects or former employers from their CV.
3. Reference their technical skills.
4. Keep the tone warm, professional, and personalized.

Template Subject: ${subjectTemplate}
Template Body: ${bodyTemplate}

${warning ? `CRITICAL WARNING: ${warning}` : ''}
`,
      model,
    });

    const res = await agent.generate(
      `Candidate Name: ${cand.display_name}
Candidate CV Content:
${cand.cv_text}`,
      {
        structuredOutput: {
          schema: z.object({
            subject: z.string().describe('Email subject line'),
            body: z.string().describe('Email body text'),
          }),
        },
        temperature: temp,
        abortSignal: input.abortSignal,
        // biome-ignore lint/suspicious/noExplicitAny: Mastra options cast
      } as any,
    );

    return res.object;
  };

  // Helper function for anti-hallucination verification
  const verifyDraft = async (subject: string, body: string) => {
    const verificationAgent = new Agent({
      id: 'smartrecruit.hallucinationVerifier',
      name: 'Hallucination Verifier',
      instructions: `You are an anti-hallucination verification agent.
Your task is to verify if the drafted email outreach contains any hallucinated information not present in the candidate's CV.
Analyze the email draft and compare it against the candidate's raw CV:
1. Extract any client names, projects, or company names mentioned in the email draft.
2. For each extracted entity, check if it is clearly mentioned in the candidate's CV.
3. If it is NOT in the CV, it is a hallucination.
Return passed=false and the list of hallucinated entities if any mismatch is found.`,
      model,
    });

    const ver = await verificationAgent.generate(
      `Candidate CV Content:
${cand.cv_text}

Email Subject: ${subject}
Email Body:
${body}`,
      {
        structuredOutput: {
          schema: z.object({
            passed: z
              .boolean()
              .describe(
                'True if all mentioned projects, client names, and company names exist in the CV',
              ),
            hallucinatedEntities: z
              .array(z.string())
              .describe('List of entities mentioned in the email but not found in the CV'),
            reason: z.string().describe('Reason for the pass/fail decision'),
          }),
        },
        abortSignal: input.abortSignal,
      },
    );

    return ver.object;
  };

  // 3. Drafting loop with self-correction
  let temp = 0.7;
  let attempt = 1;
  let draftResult: { subject: string; body: string } | undefined;
  let verification: { passed: boolean; hallucinatedEntities: string[]; reason: string } | undefined;
  let warning = '';

  while (attempt <= 3) {
    const draft = await generateDraft(temp, warning);
    if (!draft) {
      throw new Error('LLM failed to generate email draft.');
    }

    draftResult = draft;
    verification = await verifyDraft(draft.subject, draft.body);

    if (verification?.passed) {
      break;
    }

    // Hallucination detected! Run self-correction
    attempt++;
    temp = 0.0; // Lower temperature to 0
    warning = `In the previous attempt, you hallucinated details: [${verification?.hallucinatedEntities.join(', ')}]. These do NOT exist in the candidate CV. Do NOT invent projects, clients, or employers that are not in the CV. Stick strictly to the CV text.`;
  }

  const checkStatus = verification?.passed ? 'passed' : 'failed';
  const errorReason = verification?.passed
    ? null
    : `Failed anti-hallucination check: ${verification?.reason}`;

  if (!draftResult) {
    throw new Error('LLM failed to generate a usable outreach draft after all retry attempts.');
  }

  let savedId!: string;
  await withEmit(
    {
      actor: {
        userId: input.session.user_id,
        tenantId: input.session.tenant_id,
      },
    },
    async (tx) => {
      const id = crypto.randomUUID();
      await tx.insert(outreachDrafts).values({
        id,
        tenant_id: input.session.tenant_id,
        candidate_id: cand.id,
        subject: draftResult.subject,
        body: draftResult.body,
        status: 'draft',
        hallucination_check_status: checkStatus,
        error_reason: errorReason,
      });
      savedId = id;
    },
  );

  return {
    id: savedId,
    candidateId: cand.id,
    subject: draftResult.subject,
    body: draftResult.body,
    hallucinationCheckStatus: checkStatus as 'passed' | 'failed',
    errorReason,
  };
}
