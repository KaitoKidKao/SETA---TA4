import * as fs from 'node:fs/promises';
import { Agent } from '@mastra/core/agent';
import { trace as otelTrace, type Span } from '@opentelemetry/api';
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';

const tracer = otelTrace.getTracer('smartrecruit');

import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, criteria } from '../db/schema.ts';
import { upsertCandidateCvEmbedding } from '../embeddings/vector-store.ts';
import { anonymizeCvText } from './anonymize.ts';
import { getModelConfig } from './model.ts';
import { performOcr } from './ocr.ts';
import { withRetry } from './retry.ts';
import {
  calculateDeterministicScore,
  SCORING_VERSION,
  SCREENING_PROMPT_VERSION,
} from './scoring.ts';

export interface ScreenCvInput {
  existingCandidateId?: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  cvPath?: string;
  cvText: string;
  criteriaId: string;
  session: SessionScope;
  abortSignal?: AbortSignal;
}

export interface ScreenCvOutput {
  id: string;
  displayName: string;
  email: string;
  status: string;
  fitScore: number;
  totalYoe: number;
  report: {
    pros: string[];
    gaps: string[];
    yoeExplanation: string;
    overallJustification: string;
    mustHaveMatches: Array<{
      jdSkill: string;
      cvSkill: string | null;
      matched: boolean;
      justification: string;
      evidenceSnippet?: string | null;
    }>;
    niceToHaveMatches: Array<{
      jdSkill: string;
      cvSkill: string | null;
      matched: boolean;
      justification: string;
      evidenceSnippet?: string | null;
    }>;
    scoreBreakdown?: {
      mustHaveSkills: number;
      yoe: number;
      english: number;
      niceToHave: number;
    };
    flags?: string[];
    promptVersion?: string;
    scoringVersion?: string;
    model?: string;
    ocrSource?: string;
  };
}

function calculateDurationInMonths(startStr: string, endStr: string): number {
  const parseDate = (str: string): Date => {
    const s = str.trim().toLowerCase();
    if (s === 'present' || s === 'now' || s === 'current' || !s) {
      return new Date();
    }
    // YYYY-MM
    const matchYM = s.match(/^(\d{4})[-/](\d{1,2})$/);
    if (matchYM?.[1] && matchYM[2]) {
      return new Date(parseInt(matchYM[1], 10), parseInt(matchYM[2], 10) - 1, 1);
    }
    // YYYY
    const matchY = s.match(/^(\d{4})$/);
    if (matchY?.[1]) {
      return new Date(parseInt(matchY[1], 10), 0, 1);
    }
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
    return new Date();
  };

  const start = parseDate(startStr);
  const end = parseDate(endStr);

  const diffYears = end.getFullYear() - start.getFullYear();
  const diffMonths = end.getMonth() - start.getMonth();

  return Math.max(1, diffYears * 12 + diffMonths + 1);
}

export async function screenCv(input: ScreenCvInput): Promise<ScreenCvOutput> {
  requirePermission(input.session, SMARTRECRUIT_WRITE);

  return tracer.startActiveSpan('smartrecruit.screenCv', async (span: Span) => {
    span.setAttribute('candidate_name', input.candidateName);
    span.setAttribute('criteria_id', input.criteriaId);

    try {
      let cvContentText = input.cvText || '';
      let ocrSource = cvContentText.trim() ? 'provided_text' : 'none';

      if ((!cvContentText || cvContentText.trim().length === 0) && input.cvPath) {
        const isPdf = input.cvPath.toLowerCase().endsWith('.pdf');
        if (isPdf) {
          try {
            const buffer = await fs.readFile(input.cvPath);
            const doc = await getDocumentProxy(new Uint8Array(buffer));
            const { text } = await extractText(doc, { mergePages: true });
            cvContentText = Array.isArray(text) ? text.join('\n') : text;
            if (cvContentText.trim()) ocrSource = 'pdf_text_layer';
          } catch (pdfErr) {
            console.warn(
              `Direct PDF parsing failed for ${input.cvPath}, trying OCR fallback:`,
              pdfErr,
            );
          }
        }

        // Fallback to OCR if direct parsing yielded no text or if it's an image
        if (!cvContentText || cvContentText.trim().length === 0) {
          try {
            span.setAttribute('ocr_fallback_triggered', true);
            cvContentText = await performOcr(input.cvPath);
            ocrSource = 'ocr_fallback';
          } catch (ocrErr) {
            console.error(`OCR fallback failed for ${input.cvPath}:`, ocrErr);
            throw new Error(`Failed to extract text from CV file. ${String(ocrErr)}`);
          }
        }
      }

      if (!cvContentText || cvContentText.trim().length === 0) {
        throw new Error('CV text content is empty and no file path was provided for extraction.');
      }

      const db = smartrecruitDb();

      // Load criteria
      const [crit] = await db
        .select()
        .from(criteria)
        .where(
          and(eq(criteria.id, input.criteriaId), eq(criteria.tenant_id, input.session.tenant_id)),
        )
        .limit(1);

      if (!crit) {
        throw new Error(`Screening criteria with ID ${input.criteriaId} not found.`);
      }

      const model = getModelConfig();
      const agent = new Agent({
        id: 'smartrecruit.cvScreener',
        name: 'CV Screener',
        instructions: `You are an expert technical recruiter matching candidate profiles with approved recruitment criteria.

Your task is to produce an auditable screening report, not a sales summary.

Screening rules:
1. Extract work history periods from the CV only. Use YYYY-MM when available. Use "present" only when the CV indicates an ongoing role.
2. Extract technical skills from the CV only. Do not infer a skill unless there is a clear semantic equivalent. Example: PostgreSQL can support SQL; Next.js can support React. Do not treat unrelated adjacent tools as a match.
3. For every must-have and nice-to-have criterion, return one match row. Each row must include an evidence snippet copied or tightly paraphrased from the CV. If there is no evidence, matched=false, cvSkill=null, and evidenceSnippet=null.
4. Extract the candidate's English CEFR level and a supporting evidence snippet. Return null when the CV has no evidence.
5. Do not calculate a final score. The server applies approved deterministic weights.
6. Apply auto-flag rules and guardrail notes. If a critical missing item is present, include it in flags and gaps.
7. Do not reward missing information. If the CV does not mention a fact, mark it as unknown or missing.
8. Keep pros and gaps specific, evidence-based, and useful for a recruiter reviewing Gate 2.`,
        model,
      });

      // Anonymize the CV text using the LLM helper
      const anonymizedResult = await anonymizeCvText(cvContentText, input.candidateName);
      const anonymizedCvText = anonymizedResult.anonymizedText;
      const piiMapping = anonymizedResult.mapping;

      const response = await withRetry(() =>
        agent.generate(
          `Job Title: ${crit.job_title}
Must-Have Skills: ${crit.must_have_skills.join(', ')}
Nice-To-Have Skills: ${crit.nice_to_have_skills.join(', ')}
Minimum YOE Required: ${crit.min_yoe}
Maximum YOE Preferred: ${crit.max_yoe ?? 'Not specified'}
English Level Required: ${crit.english_level_required ?? 'Not specified'}
Domain Preferred: ${crit.domain_preferred ?? 'Not specified'}
Scoring Weights: must-have=${crit.weight_must_have_skills}, yoe=${crit.weight_yoe}, english=${crit.weight_english}, nice-to-have=${crit.weight_nice_to_have}
Auto-flag if missing: ${crit.auto_flag_if_missing ?? 'None'}
Guardrail Notes: ${crit.guardrail_notes ?? 'None'}
Scoring Note: ${crit.scoring_note ?? 'None'}

Candidate Name: [CANDIDATE_NAME]
Candidate CV Content:
${anonymizedCvText}`,
          {
            structuredOutput: {
              schema: z.object({
                workPeriods: z.array(
                  z.object({
                    company: z.string(),
                    role: z.string(),
                    startDate: z.string().describe('Start date in YYYY-MM format'),
                    endDate: z.string().describe('End date in YYYY-MM format or "present"'),
                    achievements: z.array(z.string()),
                  }),
                ),
                skills: z.array(z.string()),
                fitAnalysis: z.object({
                  mustHaveMatches: z.array(
                    z.object({
                      jdSkill: z.string(),
                      cvSkill: z.string().nullable(),
                      matched: z.boolean(),
                      justification: z.string(),
                      evidenceSnippet: z
                        .string()
                        .nullable()
                        .describe('Direct supporting evidence from CV, or null when missing'),
                    }),
                  ),
                  niceToHaveMatches: z.array(
                    z.object({
                      jdSkill: z.string(),
                      cvSkill: z.string().nullable(),
                      matched: z.boolean(),
                      justification: z.string(),
                      evidenceSnippet: z
                        .string()
                        .nullable()
                        .describe('Direct supporting evidence from CV, or null when missing'),
                    }),
                  ),
                  englishEvidence: z
                    .object({
                      level: z.string().nullable(),
                      evidenceSnippet: z.string().nullable(),
                    })
                    .optional(),
                  pros: z.array(z.string()),
                  gaps: z.array(z.string()),
                  flags: z
                    .array(z.string())
                    .describe(
                      'Critical guardrail or auto-flag findings that need recruiter attention',
                    ),
                  justification: z.string(),
                }),
              }),
            },
            abortSignal: input.abortSignal,
          },
        ),
      );

      const parsed = response.object;
      if (!parsed) {
        throw new Error('Failed to screen CV. LLM returned empty result.');
      }

      // Calculate Years of Experience (YOE)
      let totalMonths = 0;
      for (const period of parsed.workPeriods) {
        totalMonths += calculateDurationInMonths(period.startDate, period.endDate);
      }
      const totalYoe = Math.round((totalMonths / 12) * 10) / 10; // e.g., 2.5 years

      const yoeExplanation = `Extracted ${parsed.workPeriods.length} work periods totaling ${totalYoe} years of experience (${totalMonths} months). Minimum required is ${crit.min_yoe} years.`;
      const deterministic = calculateDeterministicScore({
        mustHaveSkills: crit.must_have_skills,
        niceToHaveSkills: crit.nice_to_have_skills,
        mustHaveMatches: parsed.fitAnalysis.mustHaveMatches,
        niceToHaveMatches: parsed.fitAnalysis.niceToHaveMatches,
        totalYoe,
        minYoe: crit.min_yoe,
        englishRequired: crit.english_level_required,
        englishLevel: parsed.fitAnalysis.englishEvidence?.level,
        englishEvidence: parsed.fitAnalysis.englishEvidence?.evidenceSnippet,
        weights: {
          mustHaveSkills: crit.weight_must_have_skills,
          yoe: crit.weight_yoe,
          english: crit.weight_english,
          niceToHave: crit.weight_nice_to_have,
        },
      });
      const modelRecord = model as unknown as {
        id?: string;
        providerId?: string;
        modelId?: string;
      };
      const modelName =
        typeof model === 'string'
          ? model
          : (modelRecord.id ??
            (modelRecord.providerId && modelRecord.modelId
              ? `${modelRecord.providerId}/${modelRecord.modelId}`
              : 'configured-model'));

      const screeningReport = {
        criteriaId: input.criteriaId,
        promptVersion: SCREENING_PROMPT_VERSION,
        scoringVersion: SCORING_VERSION,
        model: modelName,
        ocrSource,
        pros: parsed.fitAnalysis.pros,
        gaps: parsed.fitAnalysis.gaps,
        yoeExplanation,
        overallJustification: parsed.fitAnalysis.justification,
        mustHaveMatches: deterministic.mustHaveMatches,
        niceToHaveMatches: deterministic.niceToHaveMatches,
        englishEvidence: parsed.fitAnalysis.englishEvidence ?? null,
        scoreBreakdown: deterministic.scoreBreakdown,
        flags: [...new Set([...parsed.fitAnalysis.flags, ...deterministic.flags])],
        piiMapping,
      };

      const isShortlisted = deterministic.fitScore >= 70;
      const status = isShortlisted ? 'shortlisted' : 'screened';

      let savedId!: string;
      await withEmit(
        {
          actor: {
            userId: input.session.user_id,
            tenantId: input.session.tenant_id,
          },
        },
        async (tx) => {
          if (input.existingCandidateId) {
            await tx
              .update(candidates)
              .set({
                display_name: input.candidateName,
                email: input.candidateEmail,
                phone: input.candidatePhone ?? null,
                cv_path: input.cvPath ?? null,
                cv_text: cvContentText,
                status,
                fit_score: deterministic.fitScore,
                screening_report: screeningReport,
                updated_at: new Date(),
              })
              .where(
                and(
                  eq(candidates.id, input.existingCandidateId),
                  eq(candidates.tenant_id, input.session.tenant_id),
                ),
              );
            savedId = input.existingCandidateId;
          } else {
            const id = crypto.randomUUID();
            await tx.insert(candidates).values({
              id,
              tenant_id: input.session.tenant_id,
              display_name: input.candidateName,
              email: input.candidateEmail,
              phone: input.candidatePhone ?? null,
              cv_path: input.cvPath ?? null,
              cv_text: cvContentText,
              status,
              fit_score: deterministic.fitScore,
              screening_report: screeningReport,
            });
            savedId = id;
          }
        },
      );

      // Embed and update PgVector
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        await upsertCandidateCvEmbedding(dbUrl, {
          id: savedId,
          tenant_id: input.session.tenant_id,
          display_name: input.candidateName,
          email: input.candidateEmail,
          fit_score: deterministic.fitScore,
          cv_skills: parsed.skills.join(', '),
          cv_text: cvContentText,
        }).catch((err) => {
          console.error(`Failed to upsert candidate embedding for ${savedId}:`, err);
        });
      }

      span.setAttribute('fit_score', deterministic.fitScore);
      span.setAttribute('status', status);

      span.end();
      return {
        id: savedId,
        displayName: input.candidateName,
        email: input.candidateEmail,
        status,
        fitScore: deterministic.fitScore,
        totalYoe,
        report: screeningReport,
      };
    } catch (err) {
      span.recordException(err as Error);
      span.end();
      throw err;
    }
  });
}
