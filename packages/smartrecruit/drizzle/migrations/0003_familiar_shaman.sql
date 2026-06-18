CREATE TABLE "smartrecruit"."campaign_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"source" text DEFAULT 'uploaded' NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"fit_score" integer,
	"screening_report" jsonb,
	"draft_id" uuid,
	"error_reason" text,
	"started_at" timestamp with time zone,
	"screened_at" timestamp with time zone,
	"drafted_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"workflow_run_id" text,
	"criteria_id" uuid,
	"job_title" text NOT NULL,
	"jd_text" text NOT NULL,
	"template_id" uuid,
	"status" text DEFAULT 'queued' NOT NULL,
	"total_candidates" integer DEFAULT 0 NOT NULL,
	"screened_count" integer DEFAULT 0 NOT NULL,
	"shortlisted_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"drafted_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"created_by" uuid NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smartrecruit"."outreach_drafts" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_candidates_unique_candidate" ON "smartrecruit"."campaign_candidates" USING btree ("tenant_id","campaign_id","candidate_id");--> statement-breakpoint
CREATE INDEX "campaign_candidates_by_campaign" ON "smartrecruit"."campaign_candidates" USING btree ("tenant_id","campaign_id");--> statement-breakpoint
CREATE INDEX "campaign_candidates_by_status" ON "smartrecruit"."campaign_candidates" USING btree ("tenant_id","campaign_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_by_tenant_status" ON "smartrecruit"."campaigns" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "campaigns_by_tenant_created_by" ON "smartrecruit"."campaigns" USING btree ("tenant_id","created_by");--> statement-breakpoint
CREATE INDEX "campaigns_by_workflow_run" ON "smartrecruit"."campaigns" USING btree ("tenant_id","workflow_run_id");--> statement-breakpoint
CREATE INDEX "drafts_by_tenant_campaign" ON "smartrecruit"."outreach_drafts" USING btree ("tenant_id","campaign_id");