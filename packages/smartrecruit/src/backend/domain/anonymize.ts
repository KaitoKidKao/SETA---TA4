import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import { getModelConfig } from './model.ts';
import { withRetry } from './retry.ts';

export interface AnonymizeResult {
  anonymizedText: string;
  mapping: Record<string, string>;
}

export interface CanonicalContactDetails {
  name: string;
  email: string;
  phone: string | null;
}

export function buildCanonicalContactDetails(input: {
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
}): CanonicalContactDetails {
  return {
    name: input.candidateName.trim(),
    email: input.candidateEmail.trim().toLowerCase(),
    phone: input.candidatePhone?.trim() || null,
  };
}

export function localAnonymize(cvText: string, candidateName?: string): AnonymizeResult {
  if (!cvText?.trim()) {
    return { anonymizedText: '', mapping: {} };
  }

  let text = cvText;
  const mapping: Record<string, string> = {};

  // 1. Email Regex
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  let emailCount = 1;
  text = text.replace(emailRegex, (match) => {
    const placeholder = `[EMAIL_${emailCount++}]`;
    mapping[placeholder] = match;
    return placeholder;
  });

  // 2. Phone Regex
  const phoneRegex = /(\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g;
  let phoneCount = 1;
  text = text.replace(phoneRegex, (match) => {
    if (match.replace(/[^\d]/g, '').length < 8) return match;
    const placeholder = `[PHONE_${phoneCount++}]`;
    mapping[placeholder] = match;
    return placeholder;
  });

  // 3. Social URL Regex
  const urlRegex =
    /(https?:\/\/)?(www\.)?(github\.com|linkedin\.com|facebook\.com|twitter\.com)\/[a-zA-Z0-9_.-]+/gi;
  let urlCount = 1;
  text = text.replace(urlRegex, (match) => {
    const placeholder = `[URL_${urlCount++}]`;
    mapping[placeholder] = match;
    return placeholder;
  });

  // 4. Candidate Name matching (case-insensitive)
  if (candidateName && candidateName.trim().length > 2) {
    const name = candidateName.trim();
    const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const nameRegex = new RegExp(escapedName, 'gi');
    text = text.replace(nameRegex, '[CANDIDATE_NAME]');
    mapping['[CANDIDATE_NAME]'] = name;

    const parts = name.split(/\s+/).filter((p) => p.length > 2);
    for (const part of parts) {
      const escapedPart = part.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
      const partRegex = new RegExp(`\\b${escapedPart}\\b`, 'gi');
      text = text.replace(partRegex, (m) => {
        const placeholder = `[NAME_PART_${part.toUpperCase()}]`;
        mapping[placeholder] = m;
        return placeholder;
      });
    }
  }

  return {
    anonymizedText: text,
    mapping,
  };
}

export async function anonymizeCvText(
  cvText: string,
  candidateName?: string,
): Promise<AnonymizeResult> {
  // 1. Run local deterministic anonymizer first
  const localResult = localAnonymize(cvText, candidateName);

  // 2. Run LLM anonymizer on top to scrub any residual unstructured PII
  try {
    const model = getModelConfig();
    const agent = new Agent({
      id: 'smartrecruit.anonymizer',
      name: 'PII Anonymizer',
      instructions: `You are a data privacy officer. Your task is to inspect the CV text and redact any remaining Personally Identifiable Information (PII).
We have already redacted emails, phones, and social URLs with placeholders like [EMAIL_1], [PHONE_1], [URL_1].
Find and replace any other direct contact details, such as physical addresses, additional websites, or remaining names of the candidate.
Do not modify or summarize professional experience, project details, or technical skills.`,
      model,
    });

    const response = await withRetry(() =>
      agent.generate(`CV Content:\n${localResult.anonymizedText}`, {
        structuredOutput: {
          schema: z.object({
            anonymizedText: z.string().describe('The clean CV text with residual PII redacted.'),
            mapping: z.array(
              z.object({
                placeholder: z.string(),
                originalValue: z.string(),
              }),
            ),
          }),
        },
        modelSettings: { temperature: 0, seed: 42 },
      }),
    );

    const parsed = response.object;
    if (parsed) {
      const finalMapping = { ...localResult.mapping };
      for (const item of parsed.mapping) {
        const placeholder = item.placeholder.trim();
        const originalValue = item.originalValue.trim();
        if (
          !/^\[[A-Z][A-Z0-9_]*\]$/.test(placeholder) ||
          !originalValue ||
          !parsed.anonymizedText.includes(placeholder) ||
          finalMapping[placeholder]
        ) {
          continue;
        }
        finalMapping[placeholder] = originalValue;
      }
      return {
        anonymizedText: parsed.anonymizedText,
        mapping: finalMapping,
      };
    }
  } catch (err) {
    console.warn('LLM anonymization fallback failed, returning deterministic result:', err);
  }

  return localResult;
}

export function deAnonymizeText(anonymizedText: string, mapping: Record<string, string>): string {
  if (!anonymizedText) return '';
  let result = anonymizedText;
  for (const [placeholder, originalValue] of Object.entries(mapping)) {
    const escapedPlaceholder = placeholder.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(escapedPlaceholder, 'g');
    result = result.replace(regex, originalValue);
  }
  return result;
}
