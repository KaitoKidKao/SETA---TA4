import type { SessionScope } from '@seta/core';
import { and, eq } from 'drizzle-orm';
import xlsx from 'xlsx';
import { requirePermission, SMARTRECRUIT_WRITE } from '../../rbac.ts';
import { smartrecruitDb } from '../db/client.ts';
import { candidates, criteria, outreachTemplates } from '../db/schema.ts';
import { upsertCandidateCvEmbedding } from '../embeddings/vector-store.ts';
import {
  normalizeBoolean,
  normalizeEmail,
  normalizeEnglishLevel,
  normalizePhone,
  normalizeSeniority,
} from './normalize-candidate.ts';

type SheetRow = Record<string, unknown>;

export interface ImportSmartrecruitMockDataInput {
  filePath: string;
  session: SessionScope;
}

export interface ImportSmartrecruitMockDataOutput {
  candidates: { created: number; updated: number };
  criteria: { created: number; updated: number };
  templates: { created: number; updated: number };
}

function readSheetRows(filePath: string, sheetName: string): SheetRow[] {
  const workbook = xlsx.readFile(filePath, { cellDates: false });
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Sheet "${sheetName}" not found in ${filePath}`);
  }
  return xlsx.utils.sheet_to_json<SheetRow>(sheet, { defval: '' });
}

function stringValue(row: SheetRow, key: string): string {
  const value = row[key];
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function nullableString(row: SheetRow, key: string): string | null {
  const value = stringValue(row, key);
  return value ? value : null;
}

function parseInteger(row: SheetRow, key: string): number | null {
  const raw = stringValue(row, key);
  if (!raw || raw === '-') return null;
  const parsed = Number.parseInt(raw.replace(/[^\d-]/g, ''), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitSkills(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeCandidateStatus(
  raw: string,
): 'applied' | 'screened' | 'shortlisted' | 'rejected' {
  const status = raw.toLowerCase();
  if (status === 'rejected' || status === 'failed') return 'rejected';
  if (status === 'passed') return 'shortlisted';
  if (status === 'in-pool') return 'screened';
  return 'applied';
}

function buildCvText(row: SheetRow): string {
  const sections = [
    `Candidate: ${stringValue(row, 'full_name')}`,
    `Current Title: ${stringValue(row, 'current_title')}`,
    `Current Company: ${stringValue(row, 'current_company')}`,
    `Past Companies: ${stringValue(row, 'past_companies')}`,
    `Years of Experience: ${stringValue(row, 'years_of_experience')}`,
    `Seniority: ${stringValue(row, 'seniority_level')}`,
    `Domain Experience: ${stringValue(row, 'domain_experience')}`,
    `Employment History: ${stringValue(row, 'employment_history')}`,
    `Notable Projects: ${stringValue(row, 'notable_projects')}`,
    `Skills: ${stringValue(row, 'cv_skills')}`,
    `English Level: ${stringValue(row, 'english_level')}`,
    `Education: ${stringValue(row, 'highest_education')} ${stringValue(row, 'education_major')}`.trim(),
    `Certifications: ${stringValue(row, 'certifications')}`,
  ];
  return sections.filter((section) => !section.endsWith(': ')).join('\n');
}

function splitTemplate(raw: string): { subject: string; body: string } {
  const normalized = raw.replace(/\r\n/g, '\n').trim();
  const match = normalized.match(/^Subject:\s*(.+?)(?:\n\n|\n)([\s\S]*)$/i);
  if (!match) {
    return {
      subject: 'Career opportunity at SETA',
      body: normalized,
    };
  }
  return {
    subject: match[1]?.trim() || 'Career opportunity at SETA',
    body: match[2]?.trim() || normalized,
  };
}

export async function importSmartrecruitMockData(
  input: ImportSmartrecruitMockDataInput,
): Promise<ImportSmartrecruitMockDataOutput> {
  requirePermission(input.session, SMARTRECRUIT_WRITE);

  const db = smartrecruitDb();
  const tenantId = input.session.tenant_id;
  const result: ImportSmartrecruitMockDataOutput = {
    candidates: { created: 0, updated: 0 },
    criteria: { created: 0, updated: 0 },
    templates: { created: 0, updated: 0 },
  };

  const candidateRows = readSheetRows(input.filePath, 'DS-06_Candidate_Database');
  for (const row of candidateRows) {
    const externalCandidateId = stringValue(row, 'candidate_id');
    if (!externalCandidateId) continue;

    const values = {
      external_candidate_id: externalCandidateId,
      display_name: stringValue(row, 'full_name') || externalCandidateId,
      email: normalizeEmail(
        stringValue(row, 'email') || `${externalCandidateId.toLowerCase()}@mock.local`,
      ),
      phone: normalizePhone(nullableString(row, 'phone')),
      location: nullableString(row, 'location'),
      applied_position: nullableString(row, 'applied_position'),
      current_title: nullableString(row, 'current_title'),
      current_company: nullableString(row, 'current_company'),
      past_companies: nullableString(row, 'past_companies'),
      years_of_experience: parseInteger(row, 'years_of_experience'),
      seniority_level: normalizeSeniority(nullableString(row, 'seniority_level')),
      domain_experience: nullableString(row, 'domain_experience'),
      employment_history: nullableString(row, 'employment_history'),
      notable_projects: nullableString(row, 'notable_projects'),
      salary_expectation: nullableString(row, 'salary_expectation'),
      cv_skills: nullableString(row, 'cv_skills'),
      english_level: normalizeEnglishLevel(nullableString(row, 'english_level')),
      highest_education: nullableString(row, 'highest_education'),
      education_major: nullableString(row, 'education_major'),
      certifications: nullableString(row, 'certifications'),
      github_url: nullableString(row, 'github_url'),
      source_status: nullableString(row, 'status'),
      pipeline_stage: nullableString(row, 'pipeline_stage'),
      source: nullableString(row, 'source'),
      received_cv_date: nullableString(row, 'received_cv_date'),
      last_contact_date: nullableString(row, 'last_contact_date'),
      result_release_date: nullableString(row, 'result_release_date'),
      recruiter_owner: nullableString(row, 'recruiter_owner'),
      rejection_reason: nullableString(row, 'rejection_reason'),
      re_engagement_eligible: normalizeBoolean(row.re_engagement_eligible),
      re_engagement_notes: nullableString(row, 're_engagement_notes'),
      cv_text: buildCvText(row),
      status: normalizeCandidateStatus(stringValue(row, 'status')),
      updated_at: new Date(),
    };

    const [existing] = await db
      .select({ id: candidates.id })
      .from(candidates)
      .where(
        and(
          eq(candidates.tenant_id, tenantId),
          eq(candidates.external_candidate_id, externalCandidateId),
        ),
      )
      .limit(1);

    let candidateId: string;
    if (existing) {
      candidateId = existing.id;
      await db.update(candidates).set(values).where(eq(candidates.id, existing.id));
      result.candidates.updated++;
    } else {
      candidateId = crypto.randomUUID();
      await db.insert(candidates).values({
        id: candidateId,
        tenant_id: tenantId,
        ...values,
      });
      result.candidates.created++;
    }

    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl && values.cv_text) {
      await upsertCandidateCvEmbedding(dbUrl, {
        id: candidateId,
        tenant_id: tenantId,
        display_name: values.display_name,
        email: values.email,
        fit_score: null,
        cv_skills: values.cv_skills,
        cv_text: values.cv_text,
      }).catch((err) => {
        console.error(`Failed to embed candidate ${candidateId} during import:`, err);
      });
    }
  }

  const criteriaRows = readSheetRows(input.filePath, 'DS-07_Screening_Criteria');
  for (const row of criteriaRows) {
    const externalCriteriaId = stringValue(row, 'criteria_id');
    if (!externalCriteriaId) continue;
    const mustHave = splitSkills(stringValue(row, 'must_have_skills'));
    const niceToHave = splitSkills(stringValue(row, 'nice_to_have_skills'));

    const values = {
      external_criteria_id: externalCriteriaId,
      jd_id: nullableString(row, 'jd_id'),
      job_title: stringValue(row, 'position') || externalCriteriaId,
      jd_text: [
        `Position: ${stringValue(row, 'position')}`,
        `Must-have skills: ${stringValue(row, 'must_have_skills')}`,
        `Nice-to-have skills: ${stringValue(row, 'nice_to_have_skills')}`,
        `Preferred stack: ${stringValue(row, 'tech_stack_preferred')}`,
        `Scoring note: ${stringValue(row, 'scoring_note')}`,
        `Guardrails: ${stringValue(row, 'guardrail_notes')}`,
      ].join('\n'),
      must_have_skills: mustHave,
      nice_to_have_skills: niceToHave,
      tech_stack_preferred: nullableString(row, 'tech_stack_preferred'),
      seniority_required: nullableString(row, 'seniority_required'),
      min_yoe: parseInteger(row, 'min_yoe') ?? 0,
      max_yoe: parseInteger(row, 'max_yoe'),
      english_level_required: nullableString(row, 'english_level_required'),
      domain_preferred: nullableString(row, 'domain_preferred'),
      work_mode: nullableString(row, 'work_mode'),
      salary_budget_max: nullableString(row, 'salary_budget_max'),
      employment_type: nullableString(row, 'employment_type'),
      weight_must_have_skills: parseInteger(row, 'weight_must_have_skills') ?? 50,
      weight_yoe: parseInteger(row, 'weight_yoe') ?? 15,
      weight_english: parseInteger(row, 'weight_english') ?? 15,
      weight_nice_to_have: parseInteger(row, 'weight_nice_to_have') ?? 20,
      scoring_note: nullableString(row, 'scoring_note'),
      auto_flag_if_missing: nullableString(row, 'auto_flag_if_missing'),
      guardrail_notes: nullableString(row, 'guardrail_notes'),
      additional_requirements: nullableString(row, 'guardrail_notes'),
      updated_at: new Date(),
    };

    const [existing] = await db
      .select({ id: criteria.id })
      .from(criteria)
      .where(
        and(
          eq(criteria.tenant_id, tenantId),
          eq(criteria.external_criteria_id, externalCriteriaId),
        ),
      )
      .limit(1);

    if (existing) {
      await db.update(criteria).set(values).where(eq(criteria.id, existing.id));
      result.criteria.updated++;
    } else {
      await db.insert(criteria).values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        ...values,
      });
      result.criteria.created++;
    }
  }

  const templateRows = readSheetRows(input.filePath, 'DS-08_Outreach_Template');
  for (const row of templateRows) {
    const externalTemplateId = stringValue(row, 'template_id');
    if (!externalTemplateId) continue;
    const templateContent = stringValue(row, 'template_content');
    const split = splitTemplate(templateContent);
    const channel = stringValue(row, 'channel') || 'Email';

    const values = {
      external_template_id: externalTemplateId,
      name: `${externalTemplateId} - ${stringValue(row, 'use_case') || channel}`,
      source_channel: channel,
      use_case: nullableString(row, 'use_case'),
      target_status: nullableString(row, 'target_status'),
      language: nullableString(row, 'language'),
      template_content: templateContent,
      subject_template: split.subject,
      body_template: split.body,
      updated_at: new Date(),
    };

    const [existing] = await db
      .select({ id: outreachTemplates.id })
      .from(outreachTemplates)
      .where(
        and(
          eq(outreachTemplates.tenant_id, tenantId),
          eq(outreachTemplates.external_template_id, externalTemplateId),
        ),
      )
      .limit(1);

    if (existing) {
      await db.update(outreachTemplates).set(values).where(eq(outreachTemplates.id, existing.id));
      result.templates.updated++;
    } else {
      await db.insert(outreachTemplates).values({
        id: crypto.randomUUID(),
        tenant_id: tenantId,
        ...values,
      });
      result.templates.created++;
    }
  }

  return result;
}
