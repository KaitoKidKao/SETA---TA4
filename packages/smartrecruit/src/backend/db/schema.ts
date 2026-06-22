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

export const campaigns = smartrecruitSchema.table(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    workflow_run_id: text('workflow_run_id'),
    criteria_id: uuid('criteria_id'),
    job_title: text('job_title').notNull(),
    jd_text: text('jd_text').notNull(),
    template_id: uuid('template_id'),
    orchestration_version: integer('orchestration_version').default(1).notNull(),
    status: text('status', {
      enum: [
        'queued',
        'awaiting_criteria',
        'screening',
        'screening_completed',
        'drafting',
        'awaiting_outreach_approval',
        'sending',
        'completed',
        'completed_with_errors',
        'failed',
        'canceled',
      ],
    })
      .notNull()
      .default('queued'),
    total_candidates: integer('total_candidates').default(0).notNull(),
    screened_count: integer('screened_count').default(0).notNull(),
    shortlisted_count: integer('shortlisted_count').default(0).notNull(),
    failed_count: integer('failed_count').default(0).notNull(),
    drafted_count: integer('drafted_count').default(0).notNull(),
    sent_count: integer('sent_count').default(0).notNull(),
    created_by: uuid('created_by').notNull(),
    started_at: timestamp('started_at', { withTimezone: true }),
    screening_started_at: timestamp('screening_started_at', { withTimezone: true }),
    screening_completed_at: timestamp('screening_completed_at', { withTimezone: true }),
    drafting_started_at: timestamp('drafting_started_at', { withTimezone: true }),
    drafting_completed_at: timestamp('drafting_completed_at', { withTimezone: true }),
    sending_started_at: timestamp('sending_started_at', { withTimezone: true }),
    sending_completed_at: timestamp('sending_completed_at', { withTimezone: true }),
    completed_at: timestamp('completed_at', { withTimezone: true }),
    error_reason: text('error_reason'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('campaigns_by_tenant_status').on(t.tenant_id, t.status),
    index('campaigns_by_tenant_created_by').on(t.tenant_id, t.created_by),
    index('campaigns_by_workflow_run').on(t.tenant_id, t.workflow_run_id),
  ],
);

export const campaignCandidates = smartrecruitSchema.table(
  'campaign_candidates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    campaign_id: uuid('campaign_id').notNull(),
    candidate_id: uuid('candidate_id').notNull(),
    source: text('source', {
      enum: ['uploaded', 'suggested', 'mock_pool', 'manual'],
    })
      .notNull()
      .default('uploaded'),
    status: text('status', {
      enum: [
        'queued',
        'screening',
        'screened',
        'shortlisted',
        'screening_failed',
        'drafting',
        'drafted',
        'draft_failed',
        'sending',
        'sent',
        'send_failed',
        'rejected',
      ],
    })
      .notNull()
      .default('queued'),
    fit_score: integer('fit_score'),
    reviewed_fit_score: integer('reviewed_fit_score'),
    reviewed_by: uuid('reviewed_by'),
    reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
    review_reason: text('review_reason'),
    screening_report: jsonb('screening_report'),
    draft_id: uuid('draft_id'),
    error_reason: text('error_reason'),
    last_error_code: text('last_error_code'),
    screening_attempts: integer('screening_attempts').default(0).notNull(),
    drafting_attempts: integer('drafting_attempts').default(0).notNull(),
    sending_attempts: integer('sending_attempts').default(0).notNull(),
    last_attempt_at: timestamp('last_attempt_at', { withTimezone: true }),
    started_at: timestamp('started_at', { withTimezone: true }),
    screened_at: timestamp('screened_at', { withTimezone: true }),
    drafted_at: timestamp('drafted_at', { withTimezone: true }),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('campaign_candidates_unique_candidate').on(
      t.tenant_id,
      t.campaign_id,
      t.candidate_id,
    ),
    index('campaign_candidates_by_campaign').on(t.tenant_id, t.campaign_id),
    index('campaign_candidates_by_status').on(t.tenant_id, t.campaign_id, t.status),
  ],
);

export const recruiterOverrides = smartrecruitSchema.table(
  'recruiter_overrides',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    campaign_id: uuid('campaign_id').notNull(),
    candidate_id: uuid('candidate_id').notNull(),
    field: text('field').notNull(),
    ai_value: jsonb('ai_value').notNull(),
    human_value: jsonb('human_value').notNull(),
    reason: text('reason').notNull(),
    prompt_version: text('prompt_version'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index('recruiter_overrides_by_campaign_candidate').on(
      t.tenant_id,
      t.campaign_id,
      t.candidate_id,
    ),
  ],
);

export const campaignDataWarnings = smartrecruitSchema.table(
  'campaign_data_warnings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    campaign_id: uuid('campaign_id').notNull(),
    warning_code: text('warning_code').notNull(),
    severity: text('severity', { enum: ['info', 'warning', 'error'] }).notNull(),
    entity_type: text('entity_type').notNull(),
    entity_id: text('entity_id'),
    message: text('message').notNull(),
    details: jsonb('details').notNull().default({}),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
    resolved_by: uuid('resolved_by'),
    resolution_note: text('resolution_note'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('campaign_data_warnings_by_campaign').on(t.tenant_id, t.campaign_id, t.severity)],
);

export const campaignAiUsage = smartrecruitSchema.table(
  'campaign_ai_usage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    campaign_id: uuid('campaign_id').notNull(),
    candidate_id: uuid('candidate_id'),
    stage: text('stage').notNull(),
    model: text('model').notNull(),
    prompt_version: text('prompt_version').notNull(),
    input_tokens: integer('input_tokens'),
    output_tokens: integer('output_tokens'),
    latency_ms: integer('latency_ms').notNull(),
    attempt: integer('attempt').default(1).notNull(),
    ocr_source: text('ocr_source'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('campaign_ai_usage_by_campaign').on(t.tenant_id, t.campaign_id, t.stage)],
);

export const campaignReports = smartrecruitSchema.table(
  'campaign_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    campaign_id: uuid('campaign_id').notNull(),
    version: integer('version').notNull(),
    snapshot: jsonb('snapshot').notNull(),
    markdown: text('markdown').notNull(),
    content_hash: text('content_hash').notNull(),
    recruiter_note: text('recruiter_note'),
    created_by: uuid('created_by').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('campaign_reports_unique_version').on(t.tenant_id, t.campaign_id, t.version),
    index('campaign_reports_by_campaign').on(t.tenant_id, t.campaign_id, t.created_at),
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
    campaign_id: uuid('campaign_id'),
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
  (t) => [
    index('drafts_by_tenant_candidate').on(t.tenant_id, t.candidate_id),
    index('drafts_by_tenant_campaign').on(t.tenant_id, t.campaign_id),
  ],
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

export const teamSkillsMatrix = smartrecruitSchema.table(
  'team_skills_matrix',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    team_name: text('team_name').notNull(),
    proficiency_level: text('proficiency_level'),
    skill: text('skill').notNull(),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('team_skills_matrix_by_tenant_team').on(t.tenant_id, t.team_name)],
);

export const teamHireRequests = smartrecruitSchema.table(
  'team_hire_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id').notNull(),
    position_title: text('position_title').notNull(),
    team_skill_gap_summary: text('team_skill_gap_summary'),
    business_unit: text('business_unit'),
    created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('team_hire_requests_by_tenant_title').on(t.tenant_id, t.position_title)],
);
