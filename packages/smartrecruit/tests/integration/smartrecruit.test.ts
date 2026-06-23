import { Agent } from '@mastra/core/agent';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { candidates, criteria, outreachDrafts } from '../../src/backend/db/schema.ts';
import { draftOutreach } from '../../src/backend/domain/draft-outreach.ts';
import { executeOutreach } from '../../src/backend/domain/execute-outreach.ts';
import { parseJd } from '../../src/backend/domain/parse-jd.ts';
import { screenCv } from '../../src/backend/domain/screen-cv.ts';
import { withSmartrecruitTestDb } from './helpers.ts';

// Dynamic mock store to accumulate vectors in tests
let mockVectorQueryResults: any[] = [];

vi.mock('../../src/backend/embeddings/vector-store.ts', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../src/backend/embeddings/vector-store.ts')>();
  return {
    ...actual,
    getSmartrecruitVectorStore: (databaseUrl: string) => {
      return {
        createIndex: async () => {},
        upsert: async (opts: any) => {
          const ids = opts.ids || [];
          const metadata = opts.metadata || [];
          for (let i = 0; i < ids.length; i++) {
            mockVectorQueryResults.push({
              id: ids[i],
              score: 0.99,
              metadata: metadata[i],
            });
          }
        },
        query: async (opts: any) => {
          const tenantId = opts.filter?.tenant_id?.$eq;
          let results = mockVectorQueryResults;
          if (tenantId) {
            results = results.filter((r) => r.metadata?.tenant_id === tenantId);
          }
          return results.slice(0, opts.topK || 25);
        },
        disconnect: async () => {},
      };
    },
    candidateCvVectorId: actual.candidateCvVectorId,
    SMARTRECRUIT_VECTOR_INDEX: actual.SMARTRECRUIT_VECTOR_INDEX,
  };
});

let mockPdfText = 'Parsed text from PDF text-layer.';
const mockTesseractText = 'Extracted text via Tesseract local OCR.';
let mockTesseractShouldFail = false;
let mockVisionApiShouldFail = false;
let mockLlmRateLimitCalls = 0;
let mockLlmRateLimitThreshold = 0;

vi.mock('unpdf', () => {
  return {
    getDocumentProxy: async (buffer: Uint8Array) => {
      return { numPages: 1 };
    },
    extractText: async (doc: any, options?: any) => {
      return { text: mockPdfText };
    },
  };
});

vi.mock('tesseract.js', () => {
  return {
    default: {
      recognize: async (image: any, langs: string) => {
        if (mockTesseractShouldFail) {
          throw new Error('Tesseract failed');
        }
        return {
          data: {
            text: mockTesseractText,
          },
        };
      },
    },
  };
});

vi.mock('node:fs/promises', () => {
  return {
    access: async (path: string) => true,
    readFile: async (path: string) => Buffer.from('mock-file-content'),
  };
});

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

      // Mock OCR agent
      if (this.id === 'smartrecruit.ocrAgent' || instructions.includes('OCR expert')) {
        if (mockVisionApiShouldFail) {
          throw new Error('OpenAI API Quota Exceeded (429)');
        }
        return {
          text: 'Extracted text via OpenAI Vision API.',
        } as any;
      }

      // Mock Anonymizer Agent
      if (this.id === 'smartrecruit.anonymizer' || instructions.includes('redact PII')) {
        return {
          object: {
            anonymizedText: promptStr
              .replace('John Doe', '[CANDIDATE_NAME]')
              .replace('john@example.com', '[EMAIL_1]')
              .replace('+84987654321', '[PHONE_1]'),
            mapping: [
              { placeholder: '[CANDIDATE_NAME]', originalValue: 'John Doe' },
              { placeholder: '[EMAIL_1]', originalValue: 'john@example.com' },
              { placeholder: '[PHONE_1]', originalValue: '+84987654321' },
            ],
          },
        } as any;
      }

      // Mock Rate Limit
      if (mockLlmRateLimitThreshold > 0 && mockLlmRateLimitCalls < mockLlmRateLimitThreshold) {
        mockLlmRateLimitCalls++;
        throw new Error('Rate limit exceeded (HTTP 429)');
      }

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
                  evidenceSnippet: 'React developer for 3 years',
                },
                {
                  jdSkill: 'Node.js',
                  cvSkill: 'Node.js',
                  matched: true,
                  justification: 'Has Node.js experience',
                  evidenceSnippet: 'Backend Node.js stack',
                },
                {
                  jdSkill: 'SQL',
                  cvSkill: 'SQL',
                  matched: true,
                  justification: 'Has SQL experience',
                  evidenceSnippet: 'using SQL databases',
                },
              ],
              niceToHaveMatches: [
                {
                  jdSkill: 'Docker',
                  cvSkill: null,
                  matched: false,
                  justification: 'No Docker experience',
                  evidenceSnippet: null,
                },
              ],
              fitScore: 85,
              pros: ['Strong core stack alignment'],
              gaps: ['Lacks Docker experience'],
              flags: [],
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
              subject: 'Career opportunity at SETA for [CANDIDATE_NAME]',
              body: 'Hi [CANDIDATE_NAME], we noticed your Node.js experience. We would love to chat.',
            },
            // biome-ignore lint/suspicious/noExplicitAny: mock return
          } as any;
        }

        // Otherwise check if we want to simulate a hallucination in the draft
        // (to test the adoption filter)
        // Since candidate name is anonymized to [CANDIDATE_NAME], we check if the CV content matches the hallucination test candidate's CV
        if (
          promptStr.includes('Simulate Hallucination') ||
          promptStr.includes('Only worked on React and Node.js')
        ) {
          return {
            object: {
              subject: 'Outreach to [CANDIDATE_NAME]',
              body: 'Hi [CANDIDATE_NAME], we noticed you worked on the hallucinated project at TechCorp.',
            },
            // biome-ignore lint/suspicious/noExplicitAny: mock return
          } as any;
        }

        return {
          object: {
            subject: 'Career opportunity at SETA for [CANDIDATE_NAME]',
            body: 'Hi [CANDIDATE_NAME], we noticed your React experience at TechCorp. We would love to chat.',
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

      expect(cvResult.fitScore).toBe(80);
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

  it('Verification Case 1: trích xuất trực tiếp PDF text-layer', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      // Setup mock
      mockPdfText = 'Senior developer experienced in React and SQL.';
      mockVisionApiShouldFail = false;
      mockTesseractShouldFail = false;

      const jdResult = await parseJd({
        jobTitle: 'Developer',
        jdText: 'React, SQL',
        session,
      });

      const cvResult = await screenCv({
        candidateName: 'John Doe',
        candidateEmail: 'john@example.com',
        cvPath: 'john_cv.pdf',
        cvText: '', // Empty text triggers extraction
        criteriaId: jdResult.id,
        session,
      });

      expect(cvResult.displayName).toBe('John Doe');
      expect(cvResult.report.yoeExplanation).toContain('work periods');
    });
  });

  it('Verification Case 2: Fallback OCR via Vision API (GPT-4o-mini) for images', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      // Setup mock to fail direct PDF parsing (simulate image or scan PDF)
      mockPdfText = ''; // empty means no text-layer
      mockVisionApiShouldFail = false;
      mockTesseractShouldFail = false;

      const jdResult = await parseJd({
        jobTitle: 'Developer',
        jdText: 'React, SQL',
        session,
      });

      const cvResult = await screenCv({
        candidateName: 'Jane Smith',
        candidateEmail: 'jane@example.com',
        cvPath: 'jane_cv.png', // Image file
        cvText: '', // Triggers OCR
        criteriaId: jdResult.id,
        session,
      });

      expect(cvResult.displayName).toBe('Jane Smith');
      // Should have extracted text via Vision API mock
      const [cand] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, cvResult.id))
        .limit(1);
      expect(cand?.cv_text).toBe('Extracted text via OpenAI Vision API.');
    });
  });

  it('Verification Case 3: Fallback OCR local via Tesseract when Vision API fails', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      mockPdfText = '';
      mockVisionApiShouldFail = true; // Simulating OpenAI 429/quota error
      mockTesseractShouldFail = false;

      const jdResult = await parseJd({
        jobTitle: 'Developer',
        jdText: 'React, SQL',
        session,
      });

      const cvResult = await screenCv({
        candidateName: 'Fallback Candidate',
        candidateEmail: 'fallback@example.com',
        cvPath: 'fallback_cv.jpg',
        cvText: '',
        criteriaId: jdResult.id,
        session,
      });

      expect(cvResult.displayName).toBe('Fallback Candidate');
      const [cand] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, cvResult.id))
        .limit(1);
      expect(cand?.cv_text).toBe('Extracted text via Tesseract local OCR.');
    });
  });

  it('Verification Case 4: Rate Limit Retry on temporary 429 errors', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      // Simulate 429 error on the first 2 LLM calls, but succeeds on 3rd call
      mockLlmRateLimitCalls = 0;
      mockLlmRateLimitThreshold = 2;

      // Because parseJd internally uses withRetry, it will retry and succeed directly
      const result = await parseJd({
        jobTitle: 'Resilient Developer',
        jdText: 'React, Node.js',
        session,
      });

      expect(mockLlmRateLimitCalls).toBe(2);
      expect(result).toBeDefined();
      expect(result.jobTitle).toBe('Resilient Developer');
    });
  });

  it('Verification Case 5: PII Anonymization & De-anonymization in CV screening and outreach', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      const jdResult = await parseJd({
        jobTitle: 'Developer',
        jdText: 'React, Node.js',
        session,
      });

      const cvResult = await screenCv({
        candidateName: 'John Doe',
        candidateEmail: 'john@example.com',
        cvPath: 'john_cv.pdf',
        cvText: 'CV of John Doe. Contact: john@example.com, Phone: +84987654321',
        criteriaId: jdResult.id,
        session,
      });

      expect(cvResult.displayName).toBe('John Doe');

      const [cand] = await db
        .select()
        .from(candidates)
        .where(eq(candidates.id, cvResult.id))
        .limit(1);

      expect(cand).toBeDefined();
      const report = cand?.screening_report as any;
      expect(report.piiMapping).toBeDefined();
      expect(report.piiMapping['[CANDIDATE_NAME]']).toBe('John Doe');
      expect(report.piiMapping['[EMAIL_1]']).toBe('john@example.com');

      // Test draft outreach and verify it gets de-anonymized correctly before saving
      const draftResult = await draftOutreach({
        candidateId: cvResult.id,
        session,
      });

      // The returned draft should contain the de-anonymized name John Doe
      expect(draftResult.body).toContain('John Doe');
      expect(draftResult.body).not.toContain('[CANDIDATE_NAME]');
    });
  });

  it('Verification Case 6: Vector Search based screening for Candidate Pool', async () => {
    await withSmartrecruitTestDb(async ({ db, session }) => {
      // Clear mock query results before test
      mockVectorQueryResults = [];

      const jdResult = await parseJd({
        jobTitle: 'Go Developer',
        jdText: 'Golang, AWS',
        session,
      });

      // We screen two candidates, which will trigger upsert to our mockVectorQueryResults
      await screenCv({
        candidateName: 'Go Expert',
        candidateEmail: 'go@example.com',
        cvText: 'Senior Go Developer with 5 YOE',
        criteriaId: jdResult.id,
        session,
      });

      await screenCv({
        candidateName: 'Java Dev',
        candidateEmail: 'java@example.com',
        cvText: 'Java backend developer with Spring boot',
        criteriaId: jdResult.id,
        session,
      });

      // Import the pool filter domain
      const { screenCandidatePool } = await import(
        '../../src/backend/domain/screen-candidate-pool.ts'
      );

      // Query screenCandidatePool
      const result = await screenCandidatePool({
        criteriaId: jdResult.id,
        limit: 5,
        includeAlreadyScreened: true,
        session,
      });

      // It should successfully query the vector store and return results
      expect(result).toBeDefined();
      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results.map((r) => r.displayName)).toContain('Go Expert');
    });
  });
});
