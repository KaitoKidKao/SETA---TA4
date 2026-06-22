import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { describe, expect, it } from 'vitest';
import type * as schema from '../../src/backend/db/schema.ts';
import {
  campaignCandidates,
  campaignReports,
  campaigns,
  candidates,
  criteria,
  recruiterOverrides,
} from '../../src/backend/db/schema.ts';
import { createCampaignReport } from '../../src/backend/domain/campaign-report.ts';
import { reviewCampaignCandidate } from '../../src/backend/domain/review-candidate.ts';
import { withSmartrecruitTestDb } from './helpers.ts';

async function seedCampaign(db: NodePgDatabase<typeof schema>, tenantId: string, userId: string) {
  const campaignId = crypto.randomUUID();
  const candidateId = crypto.randomUUID();
  const criteriaId = crypto.randomUUID();
  await db.insert(criteria).values({
    id: criteriaId,
    tenant_id: tenantId,
    job_title: 'AI Engineer',
    jd_text: 'Python required',
    must_have_skills: ['Python'],
    nice_to_have_skills: ['AWS'],
  });
  await db.insert(campaigns).values({
    id: campaignId,
    tenant_id: tenantId,
    criteria_id: criteriaId,
    job_title: 'AI Engineer',
    jd_text: 'Python required',
    status: 'awaiting_outreach_approval',
    total_candidates: 1,
    screened_count: 1,
    shortlisted_count: 1,
    created_by: userId,
    orchestration_version: 2,
  });
  await db.insert(candidates).values({
    id: candidateId,
    tenant_id: tenantId,
    display_name: 'Nguyen Van A',
    email: 'a@example.com',
    status: 'shortlisted',
    fit_score: 72,
  });
  await db.insert(campaignCandidates).values({
    tenant_id: tenantId,
    campaign_id: campaignId,
    candidate_id: candidateId,
    status: 'shortlisted',
    fit_score: 72,
    screening_report: {
      promptVersion: 'screening-v2-evidence-extraction',
      pros: ['Python'],
      gaps: ['AWS'],
      scoreBreakdown: { mustHaveSkills: 50, yoe: 15, english: 7, niceToHave: 0 },
      mustHaveMatches: [],
      niceToHaveMatches: [],
    },
  });
  return { campaignId, candidateId };
}

describe('SmartRecruit Phase 1 decision support', () => {
  it('stores recruiter overrides without replacing the AI score', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      const seeded = await seedCampaign(db, session.tenant_id, session.user_id);
      const reviewed = await reviewCampaignCandidate({
        ...seeded,
        fitScore: 84,
        reason: 'Strong verified production experience',
        session,
      });
      expect(reviewed?.fit_score).toBe(72);
      expect(reviewed?.reviewed_fit_score).toBe(84);
      const overrides = await db.select().from(recruiterOverrides);
      expect(overrides).toHaveLength(1);
      expect(overrides[0]?.reason).toContain('verified');
    });
  });

  it('creates an immutable ranked report snapshot', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      const seeded = await seedCampaign(db, session.tenant_id, session.user_id);
      await reviewCampaignCandidate({
        ...seeded,
        fitScore: 88,
        reason: 'Recruiter-approved evidence',
        session,
      });
      const report = await createCampaignReport({
        campaignId: seeded.campaignId,
        recruiterNote: 'Review this shortlist',
        session,
      });
      expect(report?.markdown).toContain('Nguyen Van A');
      expect(report?.markdown).toContain('88');
      await db.update(candidates).set({ display_name: 'Changed Later' });
      const [stored] = await db.select().from(campaignReports);
      expect(JSON.stringify(stored?.snapshot)).toContain('Nguyen Van A');
      expect(JSON.stringify(stored?.snapshot)).not.toContain('Changed Later');
    });
  });
});
