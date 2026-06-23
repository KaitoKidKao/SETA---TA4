import { describe, expect, it } from 'vitest';
import {
  buildCanonicalContactDetails,
  localAnonymize,
} from '../../src/backend/domain/anonymize.ts';

describe('canonical contact details', () => {
  it('normalizes stable candidate contact fields independently from LLM placeholders', () => {
    expect(
      buildCanonicalContactDetails({
        candidateName: '  Nguyen Tri Cao  ',
        candidateEmail: '  KaitoKao1412@GMAIL.COM ',
        candidatePhone: ' 0967899661 ',
      }),
    ).toEqual({
      name: 'Nguyen Tri Cao',
      email: 'kaitokao1412@gmail.com',
      phone: '0967899661',
    });
  });

  it('keeps deterministic placeholders stable for direct contact fields', () => {
    const result = localAnonymize(
      'Nguyen Tri Cao | kaitokao1412@gmail.com | 0967899661',
      'Nguyen Tri Cao',
    );
    expect(result.mapping).toMatchObject({
      '[CANDIDATE_NAME]': 'Nguyen Tri Cao',
      '[EMAIL_1]': 'kaitokao1412@gmail.com',
      '[PHONE_1]': '0967899661',
    });
    expect(result.anonymizedText).toContain('[CANDIDATE_NAME]');
    expect(result.anonymizedText).toContain('[EMAIL_1]');
    expect(result.anonymizedText).toContain('[PHONE_1]');
  });
});
