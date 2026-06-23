import { z } from 'zod';

export const candidateInfoStructuredOutputSchema = z.object({
  name: z.string().describe('Full name of the candidate'),
  email: z
    .string()
    .describe('Email address of the candidate. Return an empty string when no email is present.'),
  phone: z.string().nullable().describe('Phone number of the candidate'),
});

const validatedCandidateInfoSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().nullable(),
});

export type CandidateInfo = z.infer<typeof validatedCandidateInfoSchema>;

const candidateInfoFallback: CandidateInfo = {
  name: 'Candidate Profile',
  email: 'candidate@example.com',
  phone: null,
};

export function normalizeCandidateInfo(value: unknown): CandidateInfo {
  const parsed = validatedCandidateInfoSchema.safeParse(value);
  return parsed.success ? parsed.data : candidateInfoFallback;
}
