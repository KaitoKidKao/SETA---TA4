import { Agent } from '@mastra/core/agent';
import { trace as otelTrace, type Span } from '@opentelemetry/api';
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';

const tracer = otelTrace.getTracer('smartrecruit');

const OutreachDraftSchema = z.object({
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Email body text'),
});

const VerificationSchema = z.object({
  passed: z
    .boolean()
    .describe(
      'True if all personalized and recruitment claims are grounded in the candidate context and compliant with outreach rules',
    ),
  hallucinatedEntities: z
    .array(z.string())
    .describe('List of unsupported or disallowed claims found in the email'),
  reason: z.string().describe('Reason for the pass/fail decision'),
});

type OutreachDraftResult = z.infer<typeof OutreachDraftSchema>;
type VerificationResult = z.infer<typeof VerificationSchema>;

import { smartrecruitDb } from '../db/client.ts';
import { candidates, outreachDrafts, outreachTemplates } from '../db/schema.ts';
import { anonymizeCvText, deAnonymizeText } from './anonymize.ts';
import { getModelConfig } from './model.ts';
import { withRetry } from './retry.ts';

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

  return tracer.startActiveSpan('smartrecruit.draftOutreach', async (span: Span) => {
    span.setAttribute('candidate_id', input.candidateId);
    if (input.templateId) span.setAttribute('template_id', input.templateId);

    try {
      const db = smartrecruitDb();

      // 1. Fetch candidate
      const [cand] = await db
        .select()
        .from(candidates)
        .where(
          and(
            eq(candidates.id, input.candidateId),
            eq(candidates.tenant_id, input.session.tenant_id),
          ),
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
      const templateContext = `Template Name: ${templ?.name ?? 'Default SETA outreach template'}
Template Channel: ${templ?.source_channel ?? 'Email'}
Template Use Case: ${templ?.use_case ?? 'General outreach'}
Template Target Status: ${templ?.target_status ?? 'Any'}
Template Language: ${templ?.language ?? 'English'}`;

      // 3. Prepare Anonymization
      let piiMapping: Record<string, string> = {};
      let anonymizedCvText = cand.cv_text || '';

      const report = cand.screening_report as { piiMapping?: Record<string, string> } | null;
      if (report?.piiMapping) {
        piiMapping = report.piiMapping;
        // Replace original values in cv_text with placeholders to ensure LLM only sees anonymized text
        for (const [placeholder, val] of Object.entries(piiMapping)) {
          if (!val || val.length < 2) continue;
          const escaped = val.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
          anonymizedCvText = anonymizedCvText.replace(new RegExp(escaped, 'g'), placeholder);
        }
      } else {
        // Fallback if not screened or missing mapping
        const anon = await anonymizeCvText(cand.cv_text || '');
        anonymizedCvText = anon.anonymizedText;
        piiMapping = anon.mapping;
      }

      // Find candidate name/email/phone placeholder from mapping, or use defaults
      const namePlaceholder =
        Object.keys(piiMapping).find((k) => k.includes('CANDIDATE_NAME')) || '[CANDIDATE_NAME]';
      const emailPlaceholder =
        Object.keys(piiMapping).find((k) => k.includes('EMAIL')) || '[EMAIL_1]';
      const _phonePlaceholder =
        Object.keys(piiMapping).find((k) => k.includes('PHONE')) || '[PHONE_1]';

      const model = getModelConfig();

      // Helper function for generation
      const generateDraft = async (temp: number, warning?: string) => {
        const agent = new Agent({
          id: 'smartrecruit.outreachDrafter',
          name: 'Outreach Drafter',
          instructions: `You are an expert recruitment outreach coordinator drafting a candidate email for a human approval gate.

Use the template as the source of structure and intent. Personalize only with facts present in the candidate profile or CV.

Drafting rules:
1. Ground every personalized claim in the candidate CV/profile. Mention only skills, employers, projects, domains, titles, or education that are present in the provided candidate context.
2. Do not invent years of experience, seniority, interview availability, salary, offer details, client names, project names, or company names.
3. Do not mention rejection reasons, internal recruiter notes, fit score, screening flags, or private evaluation details.
4. Match the template target status/use case. For re-engagement or in-pool candidates, use a light exploratory tone. For shortlisted candidates, use a clearer next-step tone. Do not promise an interview or offer.
5. Keep the subject concise and specific. Keep the body professional, warm, and under 180 words unless the template is longer.
6. Preserve placeholders only if the needed value is unknown; otherwise replace them with grounded candidate facts.

${templateContext}
Template Subject: ${subjectTemplate}
Template Body: ${bodyTemplate}

${warning ? `CRITICAL WARNING: ${warning}` : ''}
`,
          model,
        });

        const prompt = `Candidate Name: ${namePlaceholder}
Candidate Email: ${emailPlaceholder}
Candidate Current Status: ${cand.status}
Candidate Source Status: ${cand.source_status ?? 'Unknown'}
Candidate Pipeline Stage: ${cand.pipeline_stage ?? 'Unknown'}
Candidate Applied Position: ${cand.applied_position ?? 'Unknown'}
Candidate Current Title: ${cand.current_title ?? 'Unknown'}
Candidate Current Company: ${cand.current_company ?? 'Unknown'}
Candidate Past Companies: ${cand.past_companies ?? 'Unknown'}
Candidate Notable Projects: ${cand.notable_projects ?? 'Unknown'}
Candidate Skills: ${cand.cv_skills ?? 'Unknown'}
Candidate English Level: ${cand.english_level ?? 'Unknown'}
Candidate Education: ${[cand.highest_education, cand.education_major].filter(Boolean).join(' - ') || 'Unknown'}
Candidate Re-engagement Eligible: ${cand.re_engagement_eligible ? 'Yes' : 'No'}
Candidate Re-engagement Notes: ${cand.re_engagement_notes ?? 'None'}
Candidate CV Content:
${anonymizedCvText}`;

        const res = await withRetry(() =>
          agent.generate<typeof OutreachDraftSchema, OutreachDraftResult>(prompt, {
            structuredOutput: {
              schema: OutreachDraftSchema,
            },
            modelSettings: { temperature: temp },
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
          }),
        );

        return res.object;
      };

      // Helper function for anti-hallucination verification
      const verifyDraft = async (subject: string, body: string) => {
        const verificationAgent = new Agent({
          id: 'smartrecruit.hallucinationVerifier',
          name: 'Hallucination Verifier',
          instructions: `You are an anti-hallucination and compliance verification agent for recruitment outreach.

Compare the drafted email against the candidate context and template.

Fail the draft when it contains:
1. Any project, client, employer, skill, certification, education, title, domain, English level, or years-of-experience claim not supported by the candidate context.
2. Any promise of interview, offer, salary, job guarantee, or guaranteed next step.
3. Any mention of internal screening score, rejection reason, recruiter notes, hallucination checks, or private evaluation flags.
4. Any personalization that conflicts with the template target status/use case.

Return passed=false and list every unsupported or disallowed claim. If all claims are grounded and compliant, return passed=true.`,
          model,
        });

        const prompt = `${templateContext}

Candidate Name: ${namePlaceholder}
Candidate Current Status: ${cand.status}
Candidate Source Status: ${cand.source_status ?? 'Unknown'}
Candidate Pipeline Stage: ${cand.pipeline_stage ?? 'Unknown'}
Candidate Applied Position: ${cand.applied_position ?? 'Unknown'}
Candidate Current Title: ${cand.current_title ?? 'Unknown'}
Candidate Current Company: ${cand.current_company ?? 'Unknown'}
Candidate Past Companies: ${cand.past_companies ?? 'Unknown'}
Candidate Notable Projects: ${cand.notable_projects ?? 'Unknown'}
Candidate Skills: ${cand.cv_skills ?? 'Unknown'}
Candidate English Level: ${cand.english_level ?? 'Unknown'}
Candidate Education: ${[cand.highest_education, cand.education_major].filter(Boolean).join(' - ') || 'Unknown'}
Candidate Re-engagement Eligible: ${cand.re_engagement_eligible ? 'Yes' : 'No'}
Candidate Re-engagement Notes: ${cand.re_engagement_notes ?? 'None'}
Candidate CV Content:
${anonymizedCvText}

Email Subject: ${subject}
Email Body:
${body}`;

        const ver = await withRetry(() =>
          verificationAgent.generate<typeof VerificationSchema, VerificationResult>(prompt, {
            structuredOutput: {
              schema: VerificationSchema,
            },
            ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
          }),
        );

        return ver.object;
      };

      // 3. Drafting loop with self-correction
      let temp = 0.7;
      let attempt = 1;
      let draftResult: OutreachDraftResult | undefined;
      let verification: VerificationResult | undefined;
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
        warning = `In the previous attempt, you used unsupported or disallowed claims: [${verification?.hallucinatedEntities.join(', ')}]. Remove them. Do not invent facts, scores, salary, interview promises, offers, projects, clients, employers, titles, skills, education, English level, or years of experience. Stick strictly to the candidate context and template.`;
      }

      const checkStatus = verification?.passed ? 'passed' : 'failed';
      const errorReason = verification?.passed
        ? null
        : `Failed anti-hallucination check: ${verification?.reason}`;

      if (!draftResult) {
        throw new Error('LLM failed to generate a usable outreach draft after all retry attempts.');
      }

      // De-anonymize the final subject & body before saving to CSDL
      const finalSubject = deAnonymizeText(draftResult.subject, piiMapping);
      const finalBody = deAnonymizeText(draftResult.body, piiMapping);

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
            subject: finalSubject,
            body: finalBody,
            status: 'draft',
            hallucination_check_status: checkStatus,
            error_reason: errorReason,
          });
          savedId = id;
        },
      );

      span.setAttribute('hallucination_check_status', checkStatus);
      span.setAttribute('attempts', attempt);

      span.end();
      return {
        id: savedId,
        candidateId: cand.id,
        subject: finalSubject,
        body: finalBody,
        hallucinationCheckStatus: checkStatus as 'passed' | 'failed',
        errorReason,
      };
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}
