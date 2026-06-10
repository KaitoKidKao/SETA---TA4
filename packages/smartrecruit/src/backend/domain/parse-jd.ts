import { Agent } from '@mastra/core/agent';
import type { SessionScope } from '@seta/core';
import { withEmit } from '@seta/core/events';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { criteria } from '../db/schema.ts';
import { getModelConfig } from './model.ts';

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
  educationLevel: string | null;
  additionalRequirements: string | null;
}

export async function parseJd(input: ParseJdInput): Promise<ParseJdOutput> {
  requirePermission(input.session, SMARTRECRUIT_WRITE);

  const model = getModelConfig();
  const agent = new Agent({
    id: 'smartrecruit.jdParser',
    name: 'Job Description Parser',
    instructions: `You are an expert recruitment coordinator. Analyze the job description for the position of "${input.jobTitle}".
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
    `Job Title: ${input.jobTitle}\n\nJob Description:\n${input.jdText}`,
    {
      structuredOutput: {
        schema: z.object({
          mustHaveSkills: z.array(z.string()).describe('List of must-have technical skills'),
          niceToHaveSkills: z
            .array(z.string())
            .describe('List of nice-to-have or optional technical skills'),
          minYoe: z.number().int().default(0).describe('Minimum years of experience required'),
          educationLevel: z.string().nullable().describe('Required education level, e.g. Bachelor'),
          additionalRequirements: z
            .string()
            .nullable()
            .describe('Additional notes or soft skill requirements'),
        }),
      },
      abortSignal: input.abortSignal,
    },
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
    educationLevel: parsed.educationLevel,
    additionalRequirements: parsed.additionalRequirements,
  };
}
