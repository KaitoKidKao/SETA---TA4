import { Agent } from '@mastra/core/agent';
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, criteria } from '../db/schema.ts';
import { getModelConfig } from './model.ts';

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
    }>;
    niceToHaveMatches: Array<{
      jdSkill: string;
      cvSkill: string | null;
      matched: boolean;
      justification: string;
    }>;
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

  const db = smartrecruitDb();

  // Load criteria
  const [crit] = await db
    .select()
    .from(criteria)
    .where(and(eq(criteria.id, input.criteriaId), eq(criteria.tenant_id, input.session.tenant_id)))
    .limit(1);

  if (!crit) {
    throw new Error(`Screening criteria with ID ${input.criteriaId} not found.`);
  }

  const model = getModelConfig();
  const agent = new Agent({
    id: 'smartrecruit.cvScreener',
    name: 'CV Screener',
    instructions: `You are an expert technical recruiter matching candidate profiles (CVs) with recruitment criteria.
Analyze the candidate's CV and:
1. Extract candidate's work history periods. For each period, identify company, role, startDate (YYYY-MM), and endDate (YYYY-MM or "present").
2. List all technical skills mentioned in the CV.
3. Compare the candidate's skills against the must-have and nice-to-have skills required in the job criteria. Perform semantic mapping (e.g. Next.js matches React, Postgres matches SQL, etc.).
4. Justify each match or missing skill clearly.
5. Provide list of candidate Pros, Gaps, and an overall suitability justification.
6. Calculate a suitability Fit Score from 0 to 100 based on how well they meet both must-have and nice-to-have criteria.`,
    model,
  });

  const response = await agent.generate(
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

Candidate Name: ${input.candidateName}
Candidate CV Content:
${input.cvText}`,
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
            fitScore: z.number().int().min(0).max(100),
            pros: z.array(z.string()),
            gaps: z.array(z.string()),
            justification: z.string(),
          }),
        }),
      },
      abortSignal: input.abortSignal,
    },
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

  const screeningReport = {
    pros: parsed.fitAnalysis.pros,
    gaps: parsed.fitAnalysis.gaps,
    yoeExplanation,
    overallJustification: parsed.fitAnalysis.justification,
    mustHaveMatches: parsed.fitAnalysis.mustHaveMatches,
    niceToHaveMatches: parsed.fitAnalysis.niceToHaveMatches,
  };

  const isShortlisted = parsed.fitAnalysis.fitScore >= 70;
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
            cv_text: input.cvText,
            status,
            fit_score: parsed.fitAnalysis.fitScore,
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
          cv_text: input.cvText,
          status,
          fit_score: parsed.fitAnalysis.fitScore,
          screening_report: screeningReport,
        });
        savedId = id;
      }
    },
  );

  return {
    id: savedId,
    displayName: input.candidateName,
    email: input.candidateEmail,
    status,
    fitScore: parsed.fitAnalysis.fitScore,
    totalYoe,
    report: screeningReport,
  };
}
