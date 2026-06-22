CREATE TABLE "smartrecruit"."team_hire_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"position_title" text NOT NULL,
	"team_skill_gap_summary" text,
	"business_unit" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "smartrecruit"."team_skills_matrix" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"team_name" text NOT NULL,
	"proficiency_level" text,
	"skill" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "team_hire_requests_by_tenant_title" ON "smartrecruit"."team_hire_requests" USING btree ("tenant_id","position_title");--> statement-breakpoint
CREATE INDEX "team_skills_matrix_by_tenant_team" ON "smartrecruit"."team_skills_matrix" USING btree ("tenant_id","team_name");