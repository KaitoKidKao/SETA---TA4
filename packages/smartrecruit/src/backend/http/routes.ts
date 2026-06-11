import { Agent } from '@mastra/core/agent';
import type { SessionEnv } from '@seta/core';
import { and, desc, eq } from 'drizzle-orm';
import type { Hono } from 'hono';
import { extractText, getDocumentProxy } from 'unpdf';
import { z } from 'zod';
import { requirePermission, SMARTRECRUIT_ACCESS, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, criteria, outreachDrafts, outreachTemplates } from '../db/schema.ts';
import { draftOutreach } from '../domain/draft-outreach.ts';
import { executeOutreach } from '../domain/execute-outreach.ts';
import { getModelConfig } from '../domain/model.ts';
import { parseJd } from '../domain/parse-jd.ts';
import { screenCv } from '../domain/screen-cv.ts';

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

export function registerSmartrecruitRoutes(app: Hono<SessionEnv>): void {
  // Guard all smartrecruit endpoints with access permission
  app.use('/api/smartrecruit/v1/*', async (c, next) => {
    const session = c.get('user');
    requirePermission(session, SMARTRECRUIT_ACCESS);
    await next();
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
}
