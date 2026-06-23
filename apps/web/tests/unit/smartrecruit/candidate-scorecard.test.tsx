import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CandidateScorecard } from '../../../src/modules/smartrecruit/components/CandidateScorecard';

describe('SmartRecruit English presentation contract', () => {
  it('renders English product labels while preserving Vietnamese CV evidence verbatim', () => {
    const vietnameseEvidence =
      'Ứng viên đã triển khai Kafka migration cho hệ thống thanh toán trong 6 tháng.';

    render(
      <CandidateScorecard
        campaignId="campaign-1"
        onReviewSaved={vi.fn(async () => {})}
        selectedCandidate={{
          id: 'candidate-1',
          display_name: 'Nguyễn Văn A',
          email: 'candidate@example.com',
          phone: null,
          status: 'shortlisted',
          fit_score: 75,
          effective_fit_score: 75,
          reviewed_fit_score: null,
          review_reason: null,
          screening_report: {
            pros: ['Strong distributed-systems background'],
            gaps: ['Needs more frontend exposure'],
            yoeExplanation: 'Five years of relevant backend experience.',
            overallJustification: 'Good match for the backend role.',
            mustHaveMatches: [
              {
                jdSkill: 'Kafka',
                cvSkill: 'Kafka',
                matched: true,
                justification: 'Kafka project evidence found.',
                evidenceSnippet: vietnameseEvidence,
              },
            ],
            niceToHaveMatches: [],
            scoreBreakdown: {
              mustHaveSkills: 80,
              yoe: 75,
              english: 70,
              niceToHave: 60,
            },
          },
        }}
      />,
    );

    expect(screen.getByText('AI Candidate Scorecard')).toBeInTheDocument();
    expect(screen.getByText('Skills Alignment Matrix')).toBeInTheDocument();
    expect(screen.getByText('Must-have requirements')).toBeInTheDocument();
    expect(screen.getByText('Strengths')).toBeInTheDocument();
    expect(screen.getByText('Skill gaps')).toBeInTheDocument();
    expect(screen.getByText(vietnameseEvidence)).toBeInTheDocument();
  });
});
