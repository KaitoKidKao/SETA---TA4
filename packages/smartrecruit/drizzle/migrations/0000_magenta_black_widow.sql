CREATE SCHEMA "smartrecruit";
--> statement-breakpoint
CREATE TABLE "smartrecruit"."candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"display_name" text NOT NULL,
	"email" text NOT NULL,
	"phone" text,
	"cv_path" text,
	"cv_text" text,
	"status" text DEFAULT 'applied' NOT NULL,
	"fit_score" integer,
	"screening_report" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"job_title" text NOT NULL,
	"jd_text" text NOT NULL,
	"must_have_skills" text[] DEFAULT '{}' NOT NULL,
	"nice_to_have_skills" text[] DEFAULT '{}' NOT NULL,
	"min_yoe" integer DEFAULT 0 NOT NULL,
	"education_level" text,
	"additional_requirements" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."outreach_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"hallucination_check_status" text DEFAULT 'pending' NOT NULL,
	"error_reason" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."outreach_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"source_channel" text NOT NULL,
	"subject_template" text NOT NULL,
	"body_template" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "candidates_by_tenant" ON "smartrecruit"."candidates" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "candidates_by_fit_score" ON "smartrecruit"."candidates" USING btree ("tenant_id","fit_score");--> statement-breakpoint
CREATE INDEX "criteria_by_tenant" ON "smartrecruit"."criteria" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "drafts_by_tenant_candidate" ON "smartrecruit"."outreach_drafts" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "templates_by_tenant_channel" ON "smartrecruit"."outreach_templates" USING btree ("tenant_id","source_channel");