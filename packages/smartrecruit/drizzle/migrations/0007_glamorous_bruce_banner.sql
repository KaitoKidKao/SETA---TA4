CREATE TABLE "smartrecruit"."hm_feedback_reminder_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"feedback_request_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"channel" text DEFAULT 'email' NOT NULL,
	"recipient_email" text,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"idempotency_key" text NOT NULL,
	"retry_number" integer DEFAULT 0 NOT NULL,
	"approved_by" uuid,
	"approved_at" timestamp with time zone,
	"queued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"provider_message_id" text,
	"failure_code" text,
	"failure_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."hm_feedback_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"external_feedback_id" text NOT NULL,
	"campaign_id" uuid,
	"candidate_id" uuid,
	"candidate_name" text NOT NULL,
	"position" text NOT NULL,
	"hiring_manager" text NOT NULL,
	"hiring_manager_email" text,
	"recruiter_owner_id" uuid,
	"recruiter_owner_email" text,
	"shortlisted_at" timestamp with time zone NOT NULL,
	"feedback_due_at" timestamp with time zone NOT NULL,
	"feedback_status" text DEFAULT 'Pending' NOT NULL,
	"submitted_at" timestamp with time zone,
	"hm_decision" text,
	"hm_feedback_text" text,
	"source_sla_breach" boolean,
	"source_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "hm_feedback_reminders_idempotency" ON "smartrecruit"."hm_feedback_reminder_attempts" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "hm_feedback_reminders_by_request" ON "smartrecruit"."hm_feedback_reminder_attempts" USING btree ("tenant_id","feedback_request_id","created_at");--> statement-breakpoint
CREATE INDEX "hm_feedback_reminders_by_status" ON "smartrecruit"."hm_feedback_reminder_attempts" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "hm_feedback_requests_tenant_external_id" ON "smartrecruit"."hm_feedback_requests" USING btree ("tenant_id","external_feedback_id");--> statement-breakpoint
CREATE INDEX "hm_feedback_requests_by_tenant_due" ON "smartrecruit"."hm_feedback_requests" USING btree ("tenant_id","feedback_due_at");--> statement-breakpoint
CREATE INDEX "hm_feedback_requests_by_tenant_status" ON "smartrecruit"."hm_feedback_requests" USING btree ("tenant_id","feedback_status");--> statement-breakpoint
CREATE INDEX "hm_feedback_requests_by_campaign" ON "smartrecruit"."hm_feedback_requests" USING btree ("tenant_id","campaign_id");