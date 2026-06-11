ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "external_candidate_id" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "applied_position" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "current_title" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "current_company" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "past_companies" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "years_of_experience" integer;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "seniority_level" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "domain_experience" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "employment_history" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "notable_projects" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "salary_expectation" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "cv_skills" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "english_level" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "highest_education" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "education_major" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "certifications" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "github_url" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "source_status" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "pipeline_stage" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "received_cv_date" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "last_contact_date" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "result_release_date" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "recruiter_owner" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "re_engagement_eligible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."candidates" ADD COLUMN "re_engagement_notes" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "external_criteria_id" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "jd_id" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "tech_stack_preferred" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "seniority_required" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "max_yoe" integer;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "english_level_required" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "domain_preferred" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "work_mode" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "salary_budget_max" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "employment_type" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "weight_must_have_skills" integer DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "weight_yoe" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "weight_english" integer DEFAULT 15 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "weight_nice_to_have" integer DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "scoring_note" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "auto_flag_if_missing" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."criteria" ADD COLUMN "guardrail_notes" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."outreach_templates" ADD COLUMN "external_template_id" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."outreach_templates" ADD COLUMN "use_case" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."outreach_templates" ADD COLUMN "target_status" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."outreach_templates" ADD COLUMN "language" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."outreach_templates" ADD COLUMN "template_content" text;--> statement-breakpoint
CREATE UNIQUE INDEX "candidates_tenant_external_candidate_id" ON "smartrecruit"."candidates" USING btree ("tenant_id","external_candidate_id");--> statement-breakpoint
CREATE INDEX "candidates_by_applied_position" ON "smartrecruit"."candidates" USING btree ("tenant_id","applied_position");--> statement-breakpoint
CREATE INDEX "candidates_by_reengagement" ON "smartrecruit"."candidates" USING btree ("tenant_id","re_engagement_eligible");--> statement-breakpoint
CREATE UNIQUE INDEX "criteria_tenant_external_criteria_id" ON "smartrecruit"."criteria" USING btree ("tenant_id","external_criteria_id");--> statement-breakpoint
CREATE INDEX "criteria_by_position" ON "smartrecruit"."criteria" USING btree ("tenant_id","job_title");--> statement-breakpoint
CREATE UNIQUE INDEX "templates_tenant_external_template_id" ON "smartrecruit"."outreach_templates" USING btree ("tenant_id","external_template_id");