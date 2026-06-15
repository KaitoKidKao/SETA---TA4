import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getModelConfig } from './model.ts';
import { withRetry } from './retry.ts';

export interface AnonymizeResult {
  anonymizedText: string;
  mapping: Record<string, string>;
}

export async function anonymizeCvText(cvText: string): Promise<AnonymizeResult> {
  if (!cvText?.trim()) {
    return { anonymizedText: '', mapping: {} };
  }

  const model = getModelConfig();
  const agent = new Agent({
    id: 'smartrecruit.anonymizer',
    name: 'PII Anonymizer',
    instructions: `You are a data privacy officer. Your task is to redact PII (Personally Identifiable Information) from the candidate's CV text.
Specifically, find and replace the following direct contact information:
- Full Name: Replace with "[CANDIDATE_NAME]". Note: Identify the primary candidate name (usually at the very top of the CV) and replace it.
- Email addresses: Replace with "[EMAIL_1]", "[EMAIL_2]", etc.
- Phone numbers: Replace with "[PHONE_1]", "[PHONE_2]", etc.
- Social links / URLs (LinkedIn, GitHub, Personal website): Replace with "[URL_1]", "[URL_2]", etc.

Keep all other professional details (skills, work experience, companies, projects, education) completely intact. Do not modify, rephrase, or summarize anything else.
Output the anonymized text and the mapping array containing the placeholders and their original values.`,
    model,
  });

  const response = await withRetry(() =>
    agent.generate(`CV Content:\n${cvText}`, {
      structuredOutput: {
        schema: z.object({
          anonymizedText: z
            .string()
            .describe(
              'The complete original CV text with direct contact details redacted/replaced by placeholders like [CANDIDATE_NAME], [EMAIL_1], [PHONE_1], [URL_1]',
            ),
          mapping: z
            .array(
              z.object({
                placeholder: z
                  .string()
                  .describe(
                    'The placeholder key, e.g. [CANDIDATE_NAME], [EMAIL_1], [PHONE_1], [URL_1]',
                  ),
                originalValue: z
                  .string()
                  .describe(
                    'The original value extracted from the CV text, e.g. "Nguyen Van A", "candidate@gmail.com", "+84987654321"',
                  ),
              }),
            )
            .describe('List of redacted placeholders and their original values'),
        }),
      },
    }),
  );

  const parsed = response.object;
  if (!parsed) {
    throw new Error('Failed to anonymize CV. LLM returned empty result.');
  }

  const mappingRecord: Record<string, string> = {};
  for (const item of parsed.mapping) {
    mappingRecord[item.placeholder] = item.originalValue;
  }

  return {
    anonymizedText: parsed.anonymizedText,
    mapping: mappingRecord,
  };
}

export function deAnonymizeText(anonymizedText: string, mapping: Record<string, string>): string {
  if (!anonymizedText) return '';
  let result = anonymizedText;
  for (const [placeholder, originalValue] of Object.entries(mapping)) {
    // Escape special regex characters in placeholder
    const escapedPlaceholder = placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');
    result = result.replace(regex, originalValue);
  }
  return result;
}
