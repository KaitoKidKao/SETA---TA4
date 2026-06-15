import {
  boolean,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const smartrecruitSchema = pgSchema('smartrecruit');

export const candidates = smartrecruitSchema.table(
  'candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    external_candidate_id: text('external_candidate_id'),
    display_name: text('display_name').notNull(),
    email: text('email').notNull(),
    phone: text('phone'),
    location: text('location'),
    applied_position: text('applied_position'),
    current_title: text('current_title'),
    current_company: text('current_company'),
    past_companies: text('past_companies'),
    years_of_experience: integer('years_of_experience'),
    seniority_level: text('seniority_level'),
    domain_experience: text('domain_experience'),
    employment_history: text('employment_history'),
    notable_projects: text('notable_projects'),
    salary_expectation: text('salary_expectation'),
    cv_skills: text('cv_skills'),
    english_level: text('english_level'),
    highest_education: text('highest_education'),
    education_major: text('education_major'),
    certifications: text('certifications'),
    github_url: text('github_url'),
    source_status: text('source_status'),
    pipeline_stage: text('pipeline_stage'),
    source: text('source'),
    received_cv_date: text('received_cv_date'),
    last_contact_date: text('last_contact_date'),
    result_release_date: text('result_release_date'),
    recruiter_owner: text('recruiter_owner'),
    rejection_reason: text('rejection_reason'),
    re_engagement_eligible: boolean('re_engagement_eligible').default(false).notNull(),
    re_engagement_notes: text('re_engagement_notes'),
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
    uniqueIndex('candidates_tenant_external_candidate_id').on(t.tenant_id, t.external_candidate_id),
    index('candidates_by_tenant').on(t.tenant_id, t.status),
    index('candidates_by_fit_score').on(t.tenant_id, t.fit_score),
    index('candidates_by_applied_position').on(t.tenant_id, t.applied_position),
    index('candidates_by_reengagement').on(t.tenant_id, t.re_engagement_eligible),
  ],
);

export const criteria = smartrecruitSchema.table(
  'criteria',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    external_criteria_id: text('external_criteria_id'),
    jd_id: text('jd_id'),
    job_title: text('job_title').notNull(),
    jd_text: text('jd_text').notNull(),
    must_have_skills: text('must_have_skills').array().default([]).notNull(),
    nice_to_have_skills: text('nice_to_have_skills').array().default([]).notNull(),
    tech_stack_preferred: text('tech_stack_preferred'),
    seniority_required: text('seniority_required'),
    min_yoe: integer('min_yoe').default(0).notNull(),
    max_yoe: integer('max_yoe'),
    english_level_required: text('english_level_required'),
    domain_preferred: text('domain_preferred'),
    work_mode: text('work_mode'),
    salary_budget_max: text('salary_budget_max'),
    employment_type: text('employment_type'),
    weight_must_have_skills: integer('weight_must_have_skills').default(50).notNull(),
    weight_yoe: integer('weight_yoe').default(15).notNull(),
    weight_english: integer('weight_english').default(15).notNull(),
    weight_nice_to_have: integer('weight_nice_to_have').default(20).notNull(),
    scoring_note: text('scoring_note'),
    auto_flag_if_missing: text('auto_flag_if_missing'),
    guardrail_notes: text('guardrail_notes'),
    education_level: text('education_level'),
    additional_requirements: text('additional_requirements'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('criteria_tenant_external_criteria_id').on(t.tenant_id, t.external_criteria_id),
    index('criteria_by_tenant').on(t.tenant_id),
    index('criteria_by_position').on(t.tenant_id, t.job_title),
  ],
);

export const outreachTemplates = smartrecruitSchema.table(
  'outreach_templates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    external_template_id: text('external_template_id'),
    name: text('name').notNull(),
    source_channel: text('source_channel').notNull(), // 'TopCV', 'LinkedIn', etc.
    use_case: text('use_case'),
    target_status: text('target_status'),
    language: text('language'),
    template_content: text('template_content'),
    subject_template: text('subject_template').notNull(),
    body_template: text('body_template').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('templates_tenant_external_template_id').on(t.tenant_id, t.external_template_id),
    index('templates_by_tenant_channel').on(t.tenant_id, t.source_channel),
  ],
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

export const interactionHistories = smartrecruitSchema.table(
  'interaction_histories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    candidate_id: uuid('candidate_id').notNull(),
    criteria_id: uuid('criteria_id'),
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    status: text('status').notNull().default('sent'),
    summary_text: text('summary_text'),
    sent_at: timestamp('sent_at', { withTimezone: true }).defaultNow().notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('interaction_histories_by_tenant_candidate').on(t.tenant_id, t.candidate_id)],
);
