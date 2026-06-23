import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SmartrecruitPage } from '../../../src/modules/smartrecruit/pages/smartrecruit-page';

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe('SmartRecruit Gate 1 JD Confirmation UX', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation(async (url: string) => {
      if (url.endsWith('/api/smartrecruit/v1/criteria')) {
        return {
          ok: true,
          json: async () => ({ criteria: [] }),
          text: async () => JSON.stringify({ criteria: [] }),
        } as unknown as Response;
      }
      if (url.includes('/api/agent/v1/workflows/runs?')) {
        return {
          ok: true,
          json: async () => ({
            rows: [
              {
                runId: 'test-run-id',
                status: 'paused',
                inputSummary: { campaignId: 'test-campaign-id' },
              },
            ],
          }),
          text: async () =>
            JSON.stringify({
              rows: [
                {
                  runId: 'test-run-id',
                  status: 'paused',
                  inputSummary: { campaignId: 'test-campaign-id' },
                },
              ],
            }),
        } as unknown as Response;
      }
      if (url.includes('/api/agent/v1/workflows/runs/test-run-id')) {
        return {
          ok: true,
          json: async () => ({
            status: 'paused',
          }),
          text: async () =>
            JSON.stringify({
              status: 'paused',
            }),
        } as unknown as Response;
      }
      if (url.includes('/api/agent/v1/workflows/my-pending-approvals')) {
        return {
          ok: true,
          json: async () => [
            {
              runId: 'test-run-id',
              stepId: 'smartrecruit.parseJd',
              proposedPayload: {
                toolCallId: 'call-1',
                primary: {
                  argsPatch: {
                    criteriaId: 'test-criteria-id',
                    campaignId: 'test-campaign-id',
                  },
                },
              },
            },
          ],
          text: async () =>
            JSON.stringify([
              {
                runId: 'test-run-id',
                stepId: 'smartrecruit.parseJd',
                proposedPayload: {
                  toolCallId: 'call-1',
                  primary: {
                    argsPatch: {
                      criteriaId: 'test-criteria-id',
                      campaignId: 'test-campaign-id',
                    },
                  },
                },
              },
            ]),
        } as unknown as Response;
      }
      if (url.includes('/api/smartrecruit/v1/criteria/')) {
        return {
          ok: true,
          json: async () => ({
            id: 'test-criteria-id',
            job_title: 'Manual AI Engineer',
            jd_text: 'Python/PyTorch',
            must_have_skills: ['Python'],
            nice_to_have_skills: [],
            min_yoe: 3,
          }),
          text: async () =>
            JSON.stringify({
              id: 'test-criteria-id',
              job_title: 'Manual AI Engineer',
              jd_text: 'Python/PyTorch',
              must_have_skills: ['Python'],
              nice_to_have_skills: [],
              min_yoe: 3,
            }),
        } as unknown as Response;
      }
      if (url.includes('/api/smartrecruit/v1/skill-gaps')) {
        return {
          ok: true,
          json: async () => ({
            teamName: 'AI Team',
            skillsGap: [],
            summary: 'Good alignment.',
            recommendations: [],
          }),
          text: async () =>
            JSON.stringify({
              teamName: 'AI Team',
              skillsGap: [],
              summary: 'Good alignment.',
              recommendations: [],
            }),
        } as unknown as Response;
      }
      if (url.includes('/api/smartrecruit/v1/campaigns/test-campaign-id/pool-search')) {
        return {
          ok: true,
          json: async () => ({ results: [] }),
          text: async () => JSON.stringify({ results: [] }),
        } as unknown as Response;
      }
      if (url.includes('/api/smartrecruit/v1/campaigns/test-campaign-id/kpis')) {
        return {
          ok: true,
          json: async () => ({
            timeToScreenSec: 120,
            shortlistRate: 50,
            totalInputTokens: 1000,
            totalOutputTokens: 2000,
            estimatedCostUsd: 0.0015,
          }),
          text: async () =>
            JSON.stringify({
              timeToScreenSec: 120,
              shortlistRate: 50,
              totalInputTokens: 1000,
              totalOutputTokens: 2000,
              estimatedCostUsd: 0.0015,
            }),
        } as unknown as Response;
      }
      if (url.includes('/api/smartrecruit/v1/campaigns/test-campaign-id/warnings')) {
        return {
          ok: true,
          json: async () => ({ warnings: [] }),
          text: async () => JSON.stringify({ warnings: [] }),
        } as unknown as Response;
      }
      if (url.includes('/api/smartrecruit/v1/campaigns/test-campaign-id')) {
        return {
          ok: true,
          json: async () => ({
            campaign: { id: 'test-campaign-id', status: 'awaiting_criteria' },
            candidates: [],
          }),
          text: async () =>
            JSON.stringify({
              campaign: { id: 'test-campaign-id', status: 'awaiting_criteria' },
              candidates: [],
            }),
        } as unknown as Response;
      }
      if (url.includes('/api/smartrecruit/v1/sla-tracker')) {
        return {
          ok: true,
          json: async () => ({ tracker: [] }),
          text: async () => JSON.stringify({ tracker: [] }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({}),
        text: async () => JSON.stringify({}),
      } as unknown as Response;
    });
  });

  it('renders Gate 1 without missing jd_id warning for manually pasted JD', async () => {
    render(<SmartrecruitPage />);

    // Wait for active criteria to load via polling (timeout 5s to allow the 2s interval to fire)
    await waitFor(
      () => {
        expect(screen.getByDisplayValue('Manual AI Engineer')).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    // Ensure we do not display the missing linked job description warning
    expect(screen.queryByText(/Warning: linked job description ID/i)).not.toBeInTheDocument();

    // Verify confirmation button shows single idle label
    const confirmButton = screen.getByRole('button', {
      name: /Confirm Criteria & Run Screening/i,
    });
    expect(confirmButton).toBeInTheDocument();
  });
});
