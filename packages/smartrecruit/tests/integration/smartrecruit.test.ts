import { Agent } from '@mastra/core/agent';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { candidates, criteria, outreachDrafts } from '../../src/backend/db/schema.ts';
import { draftOutreach } from '../../src/backend/domain/draft-outreach.ts';
import { executeOutreach } from '../../src/backend/domain/execute-outreach.ts';
import { parseJd } from '../../src/backend/domain/parse-jd.ts';
import { screenCv } from '../../src/backend/domain/screen-cv.ts';
import { withSmartrecruitTestDb } from './helpers.ts';

// Mock Seta mailer so we don't send real emails
vi.mock('@seta/shared-mailer', () => {
  return {
    parseMailerEnv: () => ({}),
    resolveTransport: async () => ({
      sender: 'hr@seta.vn',
      senderDisplayName: 'SETA HR',
      transport: {
        // biome-ignore lint/suspicious/noExplicitAny: mock transport
        send: async (_mailOpts: any) => {
          return { messageId: 'mock-msg-id' };
        },
      },
    }),
  };
});

describe('SmartRecruit Integration Tests', () => {
  // biome-ignore lint/suspicious/noExplicitAny: mock spy reference
  let agentSpy: any;

  beforeAll(() => {
    // Spy and mock Agent.prototype.generate to mock LLM outputs for structured data
    agentSpy = vi.spyOn(Agent.prototype, 'generate').mockImplementation(async function (
      // biome-ignore lint/suspicious/noExplicitAny: mock context
      this: any,
      // biome-ignore lint/suspicious/noExplicitAny: mock params
      prompt: any,
      // biome-ignore lint/suspicious/noExplicitAny: mock params
      options?: any,
    ) {
      void options;

      // We can inspect prompt content or instructions to decide mock response
      const promptStr = String(prompt);
      const instructions = this.getInstructions ? this.getInstructions() : '';

      if (promptStr.includes('Job Description:')) {
        // jdParser
        return {
          object: {
            mustHaveSkills: ['React', 'Node.js', 'SQL'],
            niceToHaveSkills: ['Docker', 'AWS'],
            minYoe: 3,
            educationLevel: 'Bachelor',
            additionalRequirements: 'Good communication skills',
          },
          // biome-ignore lint/suspicious/noExplicitAny: mock return
        } as any;
      }

      if (promptStr.includes('Candidate CV Content:') && promptStr.includes('Must-Have Skills:')) {
        // cvScreener
        return {
          object: {
            workPeriods: [
              {
                company: 'TechCorp',
                role: 'Software Engineer',
                startDate: '2020-01',
                endDate: '2023-01',
                achievements: ['Developed backend services'],
              },
            ],
            skills: ['React', 'Node.js', 'SQL', 'TypeScript'],
            fitAnalysis: {
              mustHaveMatches: [
                {
                  jdSkill: 'React',
                  cvSkill: 'React',
                  matched: true,
                  justification: 'Has React experience',
                },
                {
                  jdSkill: 'Node.js',
                  cvSkill: 'Node.js',
                  matched: true,
                  justification: 'Has Node.js experience',
                },
                {
                  jdSkill: 'SQL',
                  cvSkill: 'SQL',
                  matched: true,
                  justification: 'Has SQL experience',
                },
              ],
              niceToHaveMatches: [
                {
                  jdSkill: 'Docker',
                  cvSkill: null,
                  matched: false,
                  justification: 'No Docker experience',
                },
              ],
              fitScore: 85,
              pros: ['Strong core stack alignment'],
              gaps: ['Lacks Docker experience'],
              justification: 'Highly suitable candidate',
            },
          },
          // biome-ignore lint/suspicious/noExplicitAny: mock return
        } as any;
      }

      if (promptStr.includes('Email Subject:') || promptStr.includes('Email Body:')) {
        // hallucinationVerifier
        // For hallucination testing: if the prompt body contains "hallucinated project", fail the check
        if (promptStr.includes('hallucinated project')) {
          return {
            object: {
              passed: false,
              hallucinatedEntities: ['hallucinated project'],
              reason: 'Email references a project not present in CV.',
            },
            // biome-ignore lint/suspicious/noExplicitAny: mock return
          } as any;
        }

        return {
          object: {
            passed: true,
            hallucinatedEntities: [],
            reason: 'All mentioned entities exist in the CV.',
          },
          // biome-ignore lint/suspicious/noExplicitAny: mock return
        } as any;
      }

      if (promptStr.includes('Candidate Name:')) {
        // outreachDrafter
        // If warning is provided (meaning this is a retry attempt), generate clean copy
        if (
          instructions.includes('warning') ||
          instructions.includes('hallucinated') ||
          instructions.includes('WARNING')
        ) {
          return {
            object: {
              subject: 'Career opportunity at SETA',
              body: 'Hi Candidate, we noticed your Node.js experience. We would love to chat.',
            },
            // biome-ignore lint/suspicious/noExplicitAny: mock return
          } as any;
        }

        // Otherwise check if we want to simulate a hallucination in the draft
        // (to test the adoption filter)
        if (promptStr.includes('Simulate Hallucination')) {
          return {
            object: {
              subject: 'Outreach to Candidate',
              body: 'Hi Candidate, we noticed you worked on the hallucinated project at TechCorp.',
            },
            // biome-ignore lint/suspicious/noExplicitAny: mock return
          } as any;
        }

        return {
          object: {
            subject: 'Career opportunity at SETA',
            body: 'Hi Candidate, we noticed your React experience at TechCorp. We would love to chat.',
          },
          // biome-ignore lint/suspicious/noExplicitAny: mock return
        } as any;
      }

      // biome-ignore lint/suspicious/noExplicitAny: mock return
      return { object: null } as any;
    });
  });

  afterAll(() => {
    agentSpy.mockRestore();
  });

  it('Happy Path: executes full recruitment process successfully', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      // 1. Parse JD and extract criteria
      const jdResult = await parseJd({
        jobTitle: 'Senior React Developer',
        jdText: 'Must know React, Node.js, and SQL. 3+ years experience preferred.',
        session,
      });

      expect(jdResult.minYoe).toBe(3);
      expect(jdResult.mustHaveSkills).toContain('React');
      expect(jdResult.mustHaveSkills).toContain('Node.js');

      // Verify criteria saved to DB
      const [dbCriteria] = await db
        .select()
        .from(criteria)
        .where(eq(criteria.id, jdResult.id))
        .limit(1);
      expect(dbCriteria).toBeDefined();
      expect(dbCriteria?.job_title).toBe('Senior React Developer');

      // 2. Screen Candidate CV against Criteria
      const cvResult = await screenCv({
        candidateName: 'Trần Ngọc Thảo',
        candidateEmail: 'thaotn@example.com',
        cvText:
          'Software engineer with 3 years experience. Stack: React, Node.js, SQL, TypeScript.',
        criteriaId: jdResult.id,
        session,
      });

      expect(cvResult.fitScore).toBe(85);
      expect(cvResult.totalYoe).toBe(3.1); // 2020-01 to 2023-01 is 37 months ~ 3.1 YOE
      expect(cvResult.status).toBe('shortlisted');

      // Verify candidate saved to DB
      const [dbCandidate] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, cvResult.id))
        .limit(1);
      expect(dbCandidate).toBeDefined();
      expect(dbCandidate?.display_name).toBe('Trần Ngọc Thảo');
      expect(dbCandidate?.status).toBe('shortlisted');

      // 3. Draft Outreach email
      const draftResult = await draftOutreach({
        candidateId: cvResult.id,
        session,
      });

      expect(draftResult.hallucinationCheckStatus).toBe('passed');
      expect(draftResult.subject).toContain('Career opportunity');
      expect(draftResult.body).toContain('React experience');

      // Verify draft saved to DB
      const [dbDraft] = await db
        .select()
        .from(outreachDrafts)
        .where(eq(outreachDrafts.id, draftResult.id))
        .limit(1);
      expect(dbDraft).toBeDefined();
      expect(dbDraft?.status).toBe('draft');
      expect(dbDraft?.hallucination_check_status).toBe('passed');

      // 4. Send Outreach email (Gate 2 approved)
      const sendResult = await executeOutreach({
        draftId: draftResult.id,
        session,
      });

      expect(sendResult.status).toBe('sent');

      // Verify DB statuses updated
      const [updatedCandidate] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, cvResult.id))
        .limit(1);
      expect(updatedCandidate?.status).toBe('outreached');

      const [updatedDraft] = await db
        .select()
        .from(outreachDrafts)
        .where(eq(outreachDrafts.id, draftResult.id))
        .limit(1);
      expect(updatedDraft?.status).toBe('sent');
      expect(updatedDraft?.sent_at).toBeDefined();
    });
  });

  it('Anti-Hallucination Gate: Adoption Filter triggers retry and correction', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      // Create criteria and candidate
      const [_critRow] = await db
        .insert(criteria)
        .values({
          tenant_id: session.tenant_id,
          job_title: 'Developer',
          jd_text: 'JD description',
          must_have_skills: ['React'],
          nice_to_have_skills: [],
          min_yoe: 2,
        })
        .returning();

      const [candRow] = await db
        .insert(candidates)
        .values({
          tenant_id: session.tenant_id,
          display_name: 'Simulate Hallucination Candidate',
          email: 'hallucination@example.com',
          cv_text: 'Only worked on React and Node.js.',
          status: 'shortlisted',
        })
        .returning();

      expect(candRow).toBeDefined();

      // Draft outreach. On first attempt, we simulate drafting "hallucinated project",
      // which triggers verifier fail. The draught logic will retry (up to 2 times),
      // lowering temperature and adding a strict warning.
      const draftResult = await draftOutreach({
        candidateId: candRow!.id,
        session,
      });

      // The mock should succeed on the retry attempt because we returned clean copy for warnings
      expect(draftResult.hallucinationCheckStatus).toBe('passed');
      expect(draftResult.body).not.toContain('hallucinated project');
      expect(draftResult.body).toContain('Node.js experience');
    });
  });
});
