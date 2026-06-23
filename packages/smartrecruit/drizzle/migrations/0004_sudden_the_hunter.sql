CREATE TABLE "smartrecruit"."campaign_ai_usage" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"candidate_id" uuid,
	"stage" text NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"ocr_source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."campaign_data_warnings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"warning_code" text NOT NULL,
	"severity" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by" uuid,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."campaign_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"markdown" text NOT NULL,
	"content_hash" text NOT NULL,
	"recruiter_note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."recruiter_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"field" text NOT NULL,
	"ai_value" jsonb NOT NULL,
	"human_value" jsonb NOT NULL,
	"reason" text NOT NULL,
	"prompt_version" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "reviewed_fit_score" integer;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "review_reason" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "screening_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "drafting_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "sending_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaign_candidates" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaigns" ADD COLUMN "orchestration_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaigns" ADD COLUMN "screening_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaigns" ADD COLUMN "screening_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaigns" ADD COLUMN "drafting_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaigns" ADD COLUMN "drafting_completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaigns" ADD COLUMN "sending_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "smartrecruit"."campaigns" ADD COLUMN "sending_completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "campaign_ai_usage_by_campaign" ON "smartrecruit"."campaign_ai_usage" USING btree ("tenant_id","campaign_id","stage");--> statement-breakpoint
CREATE INDEX "campaign_data_warnings_by_campaign" ON "smartrecruit"."campaign_data_warnings" USING btree ("tenant_id","campaign_id","severity");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_reports_unique_version" ON "smartrecruit"."campaign_reports" USING btree ("tenant_id","campaign_id","version");--> statement-breakpoint
CREATE INDEX "campaign_reports_by_campaign" ON "smartrecruit"."campaign_reports" USING btree ("tenant_id","campaign_id","created_at");--> statement-breakpoint
CREATE INDEX "recruiter_overrides_by_campaign_candidate" ON "smartrecruit"."recruiter_overrides" USING btree ("tenant_id","campaign_id","candidate_id");