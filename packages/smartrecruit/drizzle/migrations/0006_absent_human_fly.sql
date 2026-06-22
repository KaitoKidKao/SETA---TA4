CREATE TABLE "smartrecruit"."interview_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"campaign_candidate_id" uuid NOT NULL,
	"candidate_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"interviewer_email" text NOT NULL,
	"interviewer_name" text,
	"candidate_email" text NOT NULL,
	"candidate_name" text,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer DEFAULT 60 NOT NULL,
	"teams_link" text,
	"graph_event_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "interview_schedules_by_campaign" ON "smartrecruit"."interview_schedules" USING btree ("tenant_id","campaign_id");--> statement-breakpoint
CREATE INDEX "interview_schedules_by_candidate" ON "smartrecruit"."interview_schedules" USING btree ("tenant_id","candidate_id");--> statement-breakpoint
CREATE INDEX "interview_schedules_by_status" ON "smartrecruit"."interview_schedules" USING btree ("tenant_id","status");