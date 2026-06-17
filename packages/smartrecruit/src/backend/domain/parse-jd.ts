import { Agent } from '@mastra/core/agent';
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { criteria } from '../db/schema.ts';
import { getModelConfig } from './model.ts';
import { withRetry } from './retry.ts';

export interface ParseJdInput {
  jobTitle: string;
  jdText: string;
  session: SessionScope;
  abortSignal?: AbortSignal;
}

export interface ParseJdOutput {
  id: string;
  jobTitle: string;
  mustHaveSkills: string[];
  niceToHaveSkills: string[];
  minYoe: number;
  maxYoe: number | null;
  techStackPreferred: string | null;
  seniorityRequired: string | null;
  englishLevelRequired: string | null;
  domainPreferred: string | null;
  workMode: string | null;
  employmentType: string | null;
  scoringNote: string | null;
  autoFlagIfMissing: string | null;
  guardrailNotes: string | null;
  educationLevel: string | null;
  additionalRequirements: string | null;
}

export async function parseJd(input: ParseJdInput): Promise<ParseJdOutput> {
  requirePermission(input.session, SMARTRECRUIT_WRITE);

  const model = getModelConfig();
  const agent = new Agent({
    id: 'smartrecruit.jdParser',
    name: 'Job Description Parser',
    instructions: `You are an expert recruitment coordinator converting a job description into screening criteria for a human-approved recruitment workflow.

Analyze the job description for "${input.jobTitle}" and extract only requirements supported by the JD text.

Extraction rules:
1. Must-have technical skills are mandatory skills, frameworks, languages, tools, platforms, or domain capabilities explicitly required by the JD.
2. Nice-to-have technical skills are preferred or optional skills. Do not duplicate must-have skills here.
3. Preserve canonical skill names where possible, for example React, Node.js, TypeScript, PostgreSQL, AWS.
4. Extract minYoe and maxYoe as integers when stated. If no maximum is stated, maxYoe must be null.
5. Extract English level, seniority, work mode, employment type, preferred domain, and preferred tech stack only when present or strongly implied by the JD.
6. Create screening guardrails that a recruiter can approve in Gate 1. Guardrails must not invent requirements absent from the JD.
7. Use default scoring weights 50/15/15/20 for must-have, YOE, English, and nice-to-have unless the JD explicitly prioritizes a different rubric.

Return the result structured according to the schema.`,
    model,
  });

  const response = await withRetry(() =>
    agent.generate(`Job Title: ${input.jobTitle}\n\nJob Description:\n${input.jdText}`, {
      structuredOutput: {
        schema: z.object({
          mustHaveSkills: z.array(z.string()).describe('List of must-have technical skills'),
          niceToHaveSkills: z
            .array(z.string())
            .describe('List of nice-to-have or optional technical skills'),
          minYoe: z.number().int().default(0).describe('Minimum years of experience required'),
          maxYoe: z
            .number()
            .int()
            .nullable()
            .describe('Maximum years of experience preferred, or null if not stated'),
          techStackPreferred: z
            .string()
            .nullable()
            .describe('Preferred technology stack summary, or null if absent'),
          seniorityRequired: z
            .string()
            .nullable()
            .describe('Required seniority level such as Junior, Middle, Senior, Lead'),
          englishLevelRequired: z
            .string()
            .nullable()
            .describe('Required English level such as Basic, Intermediate, Advanced'),
          domainPreferred: z
            .string()
            .nullable()
            .describe('Preferred business or technical domain experience'),
          workMode: z.string().nullable().describe('Work mode such as onsite, hybrid, remote'),
          employmentType: z
            .string()
            .nullable()
            .describe('Employment type such as full-time, contract, internship'),
          weightMustHaveSkills: z
            .number()
            .int()
            .min(0)
            .max(100)
            .default(50)
            .describe('Score weight for must-have skills'),
          weightYoe: z.number().int().min(0).max(100).default(15).describe('Score weight for YOE'),
          weightEnglish: z
            .number()
            .int()
            .min(0)
            .max(100)
            .default(15)
            .describe('Score weight for English requirement'),
          weightNiceToHave: z
            .number()
            .int()
            .min(0)
            .max(100)
            .default(20)
            .describe('Score weight for nice-to-have skills'),
          scoringNote: z
            .string()
            .nullable()
            .describe('Short explanation of how the scoring rubric should be applied'),
          autoFlagIfMissing: z
            .string()
            .nullable()
            .describe('Critical missing requirements that should trigger an automatic flag'),
          guardrailNotes: z
            .string()
            .nullable()
            .describe('Human-readable screening guardrails for Gate 1 review'),
          educationLevel: z.string().nullable().describe('Required education level, e.g. Bachelor'),
          additionalRequirements: z
            .string()
            .nullable()
            .describe('Additional notes or soft skill requirements'),
        }),
      },
      abortSignal: input.abortSignal,
    }),
  );

  const parsed = response.object;
  if (!parsed) {
    throw new Error('Failed to parse Job Description. LLM returned empty result.');
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
      await tx.insert(criteria).values({
        id,
        tenant_id: input.session.tenant_id,
        job_title: input.jobTitle,
        jd_text: input.jdText,
        must_have_skills: parsed.mustHaveSkills,
        nice_to_have_skills: parsed.niceToHaveSkills,
        min_yoe: parsed.minYoe,
        max_yoe: parsed.maxYoe,
        tech_stack_preferred: parsed.techStackPreferred,
        seniority_required: parsed.seniorityRequired,
        english_level_required: parsed.englishLevelRequired,
        domain_preferred: parsed.domainPreferred,
        work_mode: parsed.workMode,
        employment_type: parsed.employmentType,
        weight_must_have_skills: parsed.weightMustHaveSkills,
        weight_yoe: parsed.weightYoe,
        weight_english: parsed.weightEnglish,
        weight_nice_to_have: parsed.weightNiceToHave,
        scoring_note: parsed.scoringNote,
        auto_flag_if_missing: parsed.autoFlagIfMissing,
        guardrail_notes: parsed.guardrailNotes,
        education_level: parsed.educationLevel,
        additional_requirements: parsed.additionalRequirements,
      });
      savedId = id;
    },
  );

  return {
    id: savedId,
    jobTitle: input.jobTitle,
    mustHaveSkills: parsed.mustHaveSkills,
    niceToHaveSkills: parsed.niceToHaveSkills,
    minYoe: parsed.minYoe ?? 0,
    maxYoe: parsed.maxYoe,
    techStackPreferred: parsed.techStackPreferred,
    seniorityRequired: parsed.seniorityRequired,
    englishLevelRequired: parsed.englishLevelRequired,
    domainPreferred: parsed.domainPreferred,
    workMode: parsed.workMode,
    employmentType: parsed.employmentType,
    scoringNote: parsed.scoringNote,
    autoFlagIfMissing: parsed.autoFlagIfMissing,
    guardrailNotes: parsed.guardrailNotes,
    educationLevel: parsed.educationLevel,
    additionalRequirements: parsed.additionalRequirements,
  };
}
