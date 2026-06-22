import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Agent } from '@mastra/core/agent';
import type { SessionEnv } from '@seta/core';
import { and, desc, eq, gte, inArray } from 'drizzle-orm';
import type { Hono } from 'hono';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_ACCESS, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import {
  campaigns,
  candidates,
  criteria,
  interactionHistories,
  outreachDrafts,
  outreachTemplates,
} from '../db/schema.ts';
import {
  addCandidatesToCampaign,
  createSmartrecruitCampaign,
  getCampaignKPIs,
  getCampaignView,
} from '../domain/campaign.ts';
import {
  getCampaignMetrics,
  refreshCampaignWarnings,
  resolveCampaignWarning,
} from '../domain/campaign-operations.ts';
import {
  type CampaignReportSnapshot,
  createCampaignReport,
  getCampaignReport,
  listCampaignReports,
  renderCampaignReportPdf,
} from '../domain/campaign-report.ts';
import { draftOutreach } from '../domain/draft-outreach.ts';
import { executeOutreach } from '../domain/execute-outreach.ts';
import { importSmartrecruitMockData } from '../domain/import-mock-data.ts';
import { getModelConfig } from '../domain/model.ts';
import { parseJd } from '../domain/parse-jd.ts';
import { reviewCampaignCandidate } from '../domain/review-candidate.ts';
import { screenCandidatePool } from '../domain/screen-candidate-pool.ts';
import { screenCv } from '../domain/screen-cv.ts';
import { analyzeSkillGaps } from '../domain/skill-gap-analyzer.ts';
import { getSLATracker } from '../domain/sla-tracker.ts';
import {
  getEmbeddingWithFallback,
  getSmartrecruitVectorStore,
  SMARTRECRUIT_VECTOR_INDEX,
} from '../embeddings/vector-store.ts';

const parseJdSchema = z.object({
  jobTitle: z.string().min(1),
  jdText: z.string().min(1),
});

const screenCvSchema = z.object({
  candidateName: z.string().min(1),
  candidateEmail: z.string().email(),
  candidatePhone: z.string().optional(),
  cvPath: z.string().optional(),
  cvText: z.string().min(1),
  criteriaId: z.string().uuid(),
});

const createCampaignSchema = z.object({
  jobTitle: z.string().min(1),
  jdText: z.string().min(1),
  templateId: z.string().uuid().optional(),
  cvs: z
    .array(
      z.object({
        candidateName: z.string().min(1),
        candidateEmail: z.string().email(),
        candidatePhone: z.string().optional(),
        cvPath: z.string().optional(),
        cvText: z.string().min(1),
      }),
    )
    .min(1),
});

const importMockDataSchema = z.object({
  filePath: z.string().min(1).optional(),
});

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');

function resolveMockDataFilePath(filePath?: string): string {
  if (filePath) {
    if (isAbsolute(filePath)) return filePath;
    const cwdPath = resolve(process.cwd(), filePath);
    if (existsSync(cwdPath)) return cwdPath;
    return resolve(repoRoot, filePath);
  }
  const defaultCwdPath = resolve(process.cwd(), 'mock-data/04_ta_cv_screening.xlsx');
  if (existsSync(defaultCwdPath)) return defaultCwdPath;
  return resolve(repoRoot, 'mock-data/04_ta_cv_screening.xlsx');
}

const screenCandidatePoolSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
  includeAlreadyScreened: z.boolean().optional(),
});

const draftOutreachSchema = z.object({
  candidateId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
});

const updateCriteriaSchema = z.object({
  mustHaveSkills: z.array(z.string()),
  niceToHaveSkills: z.array(z.string()),
  minYoe: z.number().int().min(0),
  educationLevel: z.string().nullable(),
  additionalRequirements: z.string().nullable(),
});

const updateDraftSchema = z.object({
  subject: z.string().min(1),
  body: z.string().min(1),
});

const reviewCandidateSchema = z.object({
  fitScore: z.number().int().min(0).max(100),
  reason: z.string().trim().min(5).max(500),
});

const resolveWarningSchema = z.object({
  note: z.string().trim().max(500).optional(),
});

const createReportSchema = z.object({
  recruiterNote: z.string().trim().max(2_000).optional(),
});

export function registerSmartrecruitRoutes(app: Hono<SessionEnv>): void {
  // Guard all smartrecruit endpoints with access permission
  app.use('/api/smartrecruit/v1/*', async (c, next) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_ACCESS);
    await next();
  });

  // --- Campaign Endpoints ---
  app.post('/api/smartrecruit/v1/campaigns', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);

    const parsed = createCampaignSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const view = await createSmartrecruitCampaign({
      jobTitle: parsed.data.jobTitle,
      jdText: parsed.data.jdText,
      cvs: parsed.data.cvs,
      templateId: parsed.data.templateId,
      session,
    });

    return c.json(view, 201);
  });

  app.get('/api/smartrecruit/v1/campaigns', async (c) => {
    const session = c.get('user');
    const scope = c.req.query('scope') ?? 'self';
    if (scope !== 'self' && scope !== 'tenant') {
      return c.json({ error: 'VALIDATION', message: 'scope must be self|tenant' }, 400);
    }

    const db = smartrecruitDb();
    const rows = await db
      .select()
      .from(campaigns)
      .where(
        scope === 'self'
          ? and(
              eq(campaigns.tenant_id, session.tenant_id),
              eq(campaigns.created_by, session.user_id),
            )
          : eq(campaigns.tenant_id, session.tenant_id),
      )
      .orderBy(desc(campaigns.created_at));

    return c.json({ campaigns: rows });
  });

  app.get('/api/smartrecruit/v1/campaigns/:id', async (c) => {
    const session = c.get('user');
    const view = await getCampaignView({
      campaignId: c.req.param('id'),
      tenantId: session.tenant_id,
    });

    if (!view) {
      return c.json({ error: 'NOT_FOUND', message: 'Campaign not found' }, 404);
    }

    return c.json(view);
  });

  app.post('/api/smartrecruit/v1/campaigns/:id/pool-search', async (c) => {
    const session = c.get('user');
    const campaignId = c.req.param('id');
    const parsed = screenCandidatePoolSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const db = smartrecruitDb();
    const [camp] = await db
      .select({ criteria_id: campaigns.criteria_id })
      .from(campaigns)
      .where(and(eq(campaigns.id, campaignId), eq(campaigns.tenant_id, session.tenant_id)))
      .limit(1);

    if (!camp || !camp.criteria_id) {
      return c.json(
        { error: 'NOT_FOUND', message: 'Campaign or screening criteria not found' },
        404,
      );
    }

    const poolResults = await screenCandidatePool({
      criteriaId: camp.criteria_id,
      limit: parsed.data.limit,
      includeAlreadyScreened: true,
      session,
    });

    const candidateIds = poolResults.results.map((r) => r.id);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const recentOutreaches =
      candidateIds.length > 0
        ? await db
            .select({ candidate_id: interactionHistories.candidate_id })
            .from(interactionHistories)
            .where(
              and(
                eq(interactionHistories.tenant_id, session.tenant_id),
                inArray(interactionHistories.candidate_id, candidateIds),
                gte(interactionHistories.sent_at, thirtyDaysAgo),
              ),
            )
        : [];

    const recentOutreachSet = new Set(recentOutreaches.map((row) => row.candidate_id));

    const finalResults = poolResults.results.map((r) => ({
      ...r,
      hasRecentOutreach: recentOutreachSet.has(r.id),
    }));

    return c.json({
      criteriaId: poolResults.criteriaId,
      screened: poolResults.screened,
      skipped: poolResults.skipped,
      results: finalResults,
    });
  });

  app.post('/api/smartrecruit/v1/campaigns/:id/add-pool-candidates', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);
    const campaignId = c.req.param('id');

    const bodySchema = z.object({
      candidateIds: z.array(z.string().uuid()),
    });

    const parsed = bodySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    await addCandidatesToCampaign({
      campaignId,
      tenantId: session.tenant_id,
      candidateIds: parsed.data.candidateIds,
      source: 'mock_pool',
    });

    return c.json({ success: true });
  });

  app.patch(
    '/api/smartrecruit/v1/campaigns/:campaignId/candidates/:candidateId/review',
    async (c) => {
      const session = c.get('user');
      requirePermission(session, SMARTRECRUIT_WRITE);
      const parsed = reviewCandidateSchema.safeParse(await c.req.json().catch(() => ({})));
      if (!parsed.success) {
        return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
      }
      const reviewed = await reviewCampaignCandidate({
        campaignId: c.req.param('campaignId'),
        candidateId: c.req.param('candidateId'),
        fitScore: parsed.data.fitScore,
        reason: parsed.data.reason,
        session,
      });
      if (!reviewed)
        return c.json({ error: 'NOT_FOUND', message: 'Campaign candidate not found' }, 404);
      return c.json({
        campaignCandidate: reviewed,
        effectiveFitScore: reviewed.reviewed_fit_score,
      });
    },
  );

  app.get('/api/smartrecruit/v1/campaigns/:campaignId/metrics', async (c) => {
    const session = c.get('user');
    const metrics = await getCampaignMetrics({
      campaignId: c.req.param('campaignId'),
      tenantId: session.tenant_id,
    });
    if (!metrics) return c.json({ error: 'NOT_FOUND', message: 'Campaign not found' }, 404);
    return c.json(metrics);
  });

  app.get('/api/smartrecruit/v1/campaigns/:campaignId/kpis', async (c) => {
    const session = c.get('user');
    const campaignId = c.req.param('campaignId');
    const inputPrice = c.req.query('inputPrice') ? Number(c.req.query('inputPrice')) : undefined;
    const outputPrice = c.req.query('outputPrice') ? Number(c.req.query('outputPrice')) : undefined;

    try {
      const kpis = await getCampaignKPIs({
        campaignId,
        tenantId: session.tenant_id,
        tokenPricing:
          inputPrice !== undefined && outputPrice !== undefined
            ? {
                inputPricePerMillion: inputPrice,
                outputPricePerMillion: outputPrice,
              }
            : undefined,
      });
      return c.json(kpis);
    } catch (err) {
      return c.json({ error: 'FAILED_TO_GET_KPIS', message: (err as Error).message }, 500);
    }
  });

  app.get('/api/smartrecruit/v1/campaigns/:campaignId/warnings', async (c) => {
    const session = c.get('user');
    const warnings = await refreshCampaignWarnings({
      campaignId: c.req.param('campaignId'),
      tenantId: session.tenant_id,
    });
    if (!warnings) return c.json({ error: 'NOT_FOUND', message: 'Campaign not found' }, 404);
    return c.json({ warnings });
  });

  app.patch('/api/smartrecruit/v1/campaigns/:campaignId/warnings/:warningId', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);
    const parsed = resolveWarningSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const warning = await resolveCampaignWarning({
      campaignId: c.req.param('campaignId'),
      warningId: c.req.param('warningId'),
      note: parsed.data.note,
      session,
    });
    if (!warning) return c.json({ error: 'NOT_FOUND', message: 'Warning not found' }, 404);
    return c.json({ warning });
  });

  app.post('/api/smartrecruit/v1/campaigns/:campaignId/reports', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);
    const parsed = createReportSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success)
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    const report = await createCampaignReport({
      campaignId: c.req.param('campaignId'),
      recruiterNote: parsed.data.recruiterNote,
      session,
    });
    if (!report) return c.json({ error: 'NOT_FOUND', message: 'Campaign not found' }, 404);
    return c.json({ report }, 201);
  });

  app.get('/api/smartrecruit/v1/campaigns/:campaignId/reports', async (c) => {
    const session = c.get('user');
    return c.json({
      reports: await listCampaignReports({
        campaignId: c.req.param('campaignId'),
        tenantId: session.tenant_id,
      }),
    });
  });

  app.get('/api/smartrecruit/v1/campaigns/:campaignId/reports/:reportId', async (c) => {
    const session = c.get('user');
    const report = await getCampaignReport({
      campaignId: c.req.param('campaignId'),
      reportId: c.req.param('reportId'),
      tenantId: session.tenant_id,
    });
    if (!report) return c.json({ error: 'NOT_FOUND', message: 'Report not found' }, 404);
    const format = c.req.query('format') ?? 'json';
    if (format === 'json') return c.json({ report });
    if (format === 'markdown') {
      return new Response(report.markdown, {
        headers: {
          'Content-Type': 'text/markdown; charset=utf-8',
          'Content-Disposition': `attachment; filename="shortlist-report-v${report.version}.md"`,
        },
      });
    }
    if (format === 'pdf') {
      const pdf = await renderCampaignReportPdf(report.snapshot as CampaignReportSnapshot);
      return new Response(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="shortlist-report-v${report.version}.pdf"`,
        },
      });
    }
    return c.json({ error: 'VALIDATION', message: 'format must be json|markdown|pdf' }, 400);
  });

  // --- Mock Dataset Import ---
  app.post('/api/smartrecruit/v1/mock-data/import', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);

    const parsed = importMockDataSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const filePath = resolveMockDataFilePath(parsed.data.filePath);
    try {
      const result = await importSmartrecruitMockData({
        filePath,
        session,
      });

      return c.json({ filePath, ...result });
    } catch (err) {
      return c.json(
        {
          error: 'MOCK_DATA_IMPORT_FAILED',
          message: (err as Error).message,
          filePath,
        },
        500,
      );
    }
  });

  // --- File Upload & PDF Extraction (OCR Fallback) ---
  app.post('/api/smartrecruit/v1/upload-cv', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);

    try {
      const body = await c.req.parseBody();
      const file = body.file;

      if (!file || typeof file === 'string') {
        return c.json({ error: 'No file uploaded or file parameter invalid' }, 400);
      }

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      let text = '';
      try {
        const doc = await getDocumentProxy(new Uint8Array(buffer));
        const extracted = await extractText(doc, { mergePages: false });
        const pages = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
        text = pages
          .map((p) => p.trim())
          .filter(Boolean)
          .join('\n');
      } catch (err) {
        return c.json(
          {
            error: 'CV_TEXT_EXTRACTION_FAILED',
            message: 'Unable to extract text from the uploaded CV file.',
            details: (err as Error).message,
          },
          422,
        );
      }

      if (!text.trim()) {
        return c.json(
          {
            error: 'CV_TEXT_EMPTY',
            message: 'The uploaded CV file did not contain extractable text.',
          },
          422,
        );
      }

      return c.json({
        filename: file.name,
        text,
      });
    } catch (err) {
      return c.json(
        { error: 'Failed to process file upload', details: (err as Error).message },
        500,
      );
    }
  });

  // --- Extract Candidate Info from CV text ---
  app.post('/api/smartrecruit/v1/extract-candidate-info', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);

    const body = await c.req.json().catch(() => ({}));
    const cvText = body.cvText;

    if (!cvText) {
      return c.json({ error: 'cvText is required' }, 400);
    }

    try {
      const model = getModelConfig();
      const agent = new Agent({
        id: 'smartrecruit.candidateExtractor',
        name: 'Candidate Info Extractor',
        instructions:
          "You are an expert recruitment assistant. Extract the candidate's full name, email, and phone number from their CV text. Return structured output.",
        model,
      });

      const res = await agent.generate(cvText, {
        structuredOutput: {
          schema: z.object({
            name: z.string().describe('Full name of the candidate'),
            email: z.string().email().describe('Email address of the candidate'),
            phone: z.string().nullable().describe('Phone number of the candidate'),
          }),
        },
      });

      return c.json(
        res.object || { name: 'Unknown Candidate', email: 'unknown@example.com', phone: null },
      );
    } catch (_err) {
      // Fallback if LLM extraction fails or throws
      return c.json({ name: 'Candidate Profile', email: 'candidate@example.com', phone: null });
    }
  });

  // --- Criteria Endpoints ---
  app.post('/api/smartrecruit/v1/criteria/parse-jd', async (c) => {
    const session = c.get('user');
    const parsed = parseJdSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const result = await parseJd({
      jobTitle: parsed.data.jobTitle,
      jdText: parsed.data.jdText,
      session,
    });
    return c.json(result, 201);
  });

  app.get('/api/smartrecruit/v1/criteria', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const rows = await db
      .select()
      .from(criteria)
      .where(eq(criteria.tenant_id, session.tenant_id))
      .orderBy(desc(criteria.created_at));
    return c.json({ criteria: rows });
  });

  app.get('/api/smartrecruit/v1/criteria/:id', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const [row] = await db
      .select()
      .from(criteria)
      .where(and(eq(criteria.id, c.req.param('id')), eq(criteria.tenant_id, session.tenant_id)))
      .limit(1);

    if (!row) {
      return c.json({ error: 'NOT_FOUND', message: 'Criteria not found' }, 404);
    }
    return c.json(row);
  });

  app.patch('/api/smartrecruit/v1/criteria/:id', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);

    const parsed = updateCriteriaSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const db = smartrecruitDb();
    const [existing] = await db
      .select()
      .from(criteria)
      .where(and(eq(criteria.id, c.req.param('id')), eq(criteria.tenant_id, session.tenant_id)))
      .limit(1);

    if (!existing) {
      return c.json({ error: 'NOT_FOUND', message: 'Criteria not found' }, 404);
    }

    const [updated] = await db
      .update(criteria)
      .set({
        must_have_skills: parsed.data.mustHaveSkills,
        nice_to_have_skills: parsed.data.niceToHaveSkills,
        min_yoe: parsed.data.minYoe,
        education_level: parsed.data.educationLevel,
        additional_requirements: parsed.data.additionalRequirements,
        updated_at: new Date(),
      })
      .where(and(eq(criteria.id, existing.id), eq(criteria.tenant_id, session.tenant_id)))
      .returning();

    return c.json(updated);
  });

  app.post('/api/smartrecruit/v1/criteria/:id/screen-candidates', async (c) => {
    const session = c.get('user');
    const parsed = screenCandidatePoolSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const result = await screenCandidatePool({
      criteriaId: c.req.param('id'),
      limit: parsed.data.limit,
      includeAlreadyScreened: parsed.data.includeAlreadyScreened,
      session,
    });

    return c.json(result);
  });

  app.get('/api/smartrecruit/v1/criteria/:id/suggest-candidates', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const criteriaId = c.req.param('id');

    // 1. Get the criteria
    const [crit] = await db
      .select()
      .from(criteria)
      .where(and(eq(criteria.id, criteriaId), eq(criteria.tenant_id, session.tenant_id)))
      .limit(1);

    if (!crit) {
      return c.json({ error: 'NOT_FOUND', message: 'Criteria not found' }, 404);
    }

    // 2. Perform Vector Search query against PgVector
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      return c.json({ candidates: [] });
    }

    try {
      const store = getSmartrecruitVectorStore(dbUrl);
      const queryVector = await getEmbeddingWithFallback(crit.jd_text);

      const vectorResults = await store.query({
        indexName: SMARTRECRUIT_VECTOR_INDEX,
        queryVector,
        topK: 10,
        filter: { tenant_id: { $eq: session.tenant_id } },
      });

      const candidateIds = vectorResults
        .map((row) => (row.metadata as { candidate_id?: string })?.candidate_id)
        .filter(Boolean) as string[];

      if (candidateIds.length === 0) {
        return c.json({ candidates: [] });
      }

      const rows = await db
        .select()
        .from(candidates)
        .where(
          and(inArray(candidates.id, candidateIds), eq(candidates.tenant_id, session.tenant_id)),
        );

      // Sort according to vector similarity order
      const idToIndex = new Map(candidateIds.map((id, index) => [id, index]));
      rows.sort((a, b) => (idToIndex.get(a.id) ?? 999) - (idToIndex.get(b.id) ?? 999));

      return c.json({ candidates: rows });
    } catch (err) {
      return c.json({ error: 'Vector search failed', details: (err as Error).message }, 500);
    }
  });

  // --- Candidates & Scorecard Endpoints ---
  app.post('/api/smartrecruit/v1/candidates/screen-cv', async (c) => {
    const session = c.get('user');
    const parsed = screenCvSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const result = await screenCv({
      candidateName: parsed.data.candidateName,
      candidateEmail: parsed.data.candidateEmail,
      candidatePhone: parsed.data.candidatePhone,
      cvPath: parsed.data.cvPath,
      cvText: parsed.data.cvText,
      criteriaId: parsed.data.criteriaId,
      session,
    });
    return c.json(result, 201);
  });

  app.get('/api/smartrecruit/v1/candidates', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const rows = await db
      .select()
      .from(candidates)
      .where(eq(candidates.tenant_id, session.tenant_id))
      .orderBy(desc(candidates.fit_score));
    return c.json({ candidates: rows });
  });

  app.get('/api/smartrecruit/v1/candidates/:id', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const [row] = await db
      .select()
      .from(candidates)
      .where(and(eq(candidates.id, c.req.param('id')), eq(candidates.tenant_id, session.tenant_id)))
      .limit(1);

    if (!row) {
      return c.json({ error: 'NOT_FOUND', message: 'Candidate not found' }, 404);
    }
    return c.json(row);
  });

  // --- Outreach Templates Endpoints ---
  app.get('/api/smartrecruit/v1/templates', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const rows = await db
      .select()
      .from(outreachTemplates)
      .where(eq(outreachTemplates.tenant_id, session.tenant_id))
      .orderBy(desc(outreachTemplates.created_at));
    return c.json({ templates: rows });
  });

  // --- Outreach Drafts Endpoints ---
  app.post('/api/smartrecruit/v1/outreach/draft', async (c) => {
    const session = c.get('user');
    const parsed = draftOutreachSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const result = await draftOutreach({
      candidateId: parsed.data.candidateId,
      templateId: parsed.data.templateId,
      session,
    });
    return c.json(result, 201);
  });

  app.get('/api/smartrecruit/v1/outreach/drafts', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const rows = await db
      .select()
      .from(outreachDrafts)
      .where(eq(outreachDrafts.tenant_id, session.tenant_id))
      .orderBy(desc(outreachDrafts.created_at));
    return c.json({ drafts: rows });
  });

  app.get('/api/smartrecruit/v1/outreach/drafts/:id', async (c) => {
    const session = c.get('user');
    const db = smartrecruitDb();
    const [row] = await db
      .select()
      .from(outreachDrafts)
      .where(
        and(
          eq(outreachDrafts.id, c.req.param('id')),
          eq(outreachDrafts.tenant_id, session.tenant_id),
        ),
      )
      .limit(1);

    if (!row) {
      return c.json({ error: 'NOT_FOUND', message: 'Draft not found' }, 404);
    }
    return c.json(row);
  });

  app.patch('/api/smartrecruit/v1/outreach/drafts/:id', async (c) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_WRITE);

    const parsed = updateDraftSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: 'VALIDATION', details: parsed.error.flatten() }, 400);
    }

    const db = smartrecruitDb();
    const [existing] = await db
      .select()
      .from(outreachDrafts)
      .where(
        and(
          eq(outreachDrafts.id, c.req.param('id')),
          eq(outreachDrafts.tenant_id, session.tenant_id),
        ),
      )
      .limit(1);

    if (!existing) {
      return c.json({ error: 'NOT_FOUND', message: 'Draft not found' }, 404);
    }

    if (existing.status === 'sent') {
      return c.json(
        { error: 'BAD_REQUEST', message: 'Cannot update a draft that has already been sent' },
        400,
      );
    }

    const [updated] = await db
      .update(outreachDrafts)
      .set({
        subject: parsed.data.subject,
        body: parsed.data.body,
        updated_at: new Date(),
      })
      .where(eq(outreachDrafts.id, existing.id))
      .returning();

    return c.json(updated);
  });

  app.post('/api/smartrecruit/v1/outreach/drafts/:id/send', async (c) => {
    const session = c.get('user');
    const result = await executeOutreach({
      draftId: c.req.param('id'),
      session,
    });
    return c.json(result);
  });

  app.get('/api/smartrecruit/v1/skill-gaps', async (c) => {
    const session = c.get('user');
    const tenantId = session.tenant_id;
    const jobTitle = c.req.query('jobTitle') || '';
    const result = await analyzeSkillGaps(jobTitle, tenantId);
    return c.json(result);
  });

  app.get('/api/smartrecruit/v1/sla-tracker', async (c) => {
    const result = getSLATracker();
    return c.json({ tracker: result });
  });
}
