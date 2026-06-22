import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  candidateInfoStructuredOutputSchema,
  normalizeCandidateInfo,
} from '../../src/backend/domain/candidate-info-schema.ts';

describe('candidate info structured output schema', () => {
  it('does not send an email regex pattern to the model provider', () => {
    const jsonSchema = z.toJSONSchema(candidateInfoStructuredOutputSchema) as {
      properties?: { email?: { pattern?: string } };
    };

    expect(jsonSchema.properties?.email?.pattern).toBeUndefined();
  });

  it('validates the extracted email after structured output generation', () => {
    expect(
      normalizeCandidateInfo({
        name: 'Candidate Name',
        email: 'not-an-email',
        phone: null,
      }),
    ).toEqual({
      name: 'Candidate Profile',
      email: 'candidate@example.com',
      phone: null,
    });
  });
});
