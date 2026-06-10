import { index, integer, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const smartrecruitSchema = pgSchema('smartrecruit');

export const candidates = smartrecruitSchema.table(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    display_name: text('display_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    cv_path: text('cv_path'),
    cv_text: text('cv_text'),
    status: text('status', {
      enum: ['applied', 'screened', 'shortlisted', 'rejected', 'outreached'],
    })
      .notNull()
      .default('applied'),
    fit_score: integer('fit_score'),
    screening_report: jsonb('screening_report'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('candidates_by_tenant').on(t.tenant_id, t.status),
    index('candidates_by_fit_score').on(t.tenant_id, t.fit_score),
  ],
);

export const criteria = smartrecruitSchema.table(
  'criteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    job_title: text('job_title').notNull(),
    jd_text: text('jd_text').notNull(),
    must_have_skills: text('must_have_skills').array().default([]).notNull(),
    nice_to_have_skills: text('nice_to_have_skills').array().default([]).notNull(),
    min_yoe: integer('min_yoe').default(0).notNull(),
    education_level: text('education_level'),
    additional_requirements: text('additional_requirements'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('criteria_by_tenant').on(t.tenant_id)],
);

export const outreachTemplates = smartrecruitSchema.table(
  'outreach_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    name: text('name').notNull(),
    source_channel: text('source_channel').notNull(), // 'TopCV', 'LinkedIn', etc.
    subject_template: text('subject_template').notNull(),
    body_template: text('body_template').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('templates_by_tenant_channel').on(t.tenant_id, t.source_channel)],
);

export const outreachDrafts = smartrecruitSchema.table(
  'outreach_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    candidate_id: uuid('candidate_id').notNull(),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: text('status', {
      enum: ['draft', 'approved', 'sent', 'failed'],
    })
      .notNull()
      .default('draft'),
    hallucination_check_status: text('hallucination_check_status', {
      enum: ['pending', 'passed', 'failed'],
    })
      .notNull()
      .default('pending'),
    error_reason: text('error_reason'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('drafts_by_tenant_candidate').on(t.tenant_id, t.candidate_id)],
);
