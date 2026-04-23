CREATE TABLE "guardian_incidents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"watchdog" text NOT NULL,
	"agent_id" uuid,
	"run_id" uuid,
	"issue_id" uuid,
	"incident_type" text NOT NULL,
	"severity" text DEFAULT 'warning' NOT NULL,
	"description" text NOT NULL,
	"recommended_action" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp with time zone,
	"auto_action_taken" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "guardian_incidents" ADD CONSTRAINT "guardian_incidents_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_incidents" ADD CONSTRAINT "guardian_incidents_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_incidents" ADD CONSTRAINT "guardian_incidents_run_id_heartbeat_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."heartbeat_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_incidents" ADD CONSTRAINT "guardian_incidents_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_incidents_company_created_idx" ON "guardian_incidents" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "guardian_incidents_company_resolved_idx" ON "guardian_incidents" USING btree ("company_id","resolved","created_at");--> statement-breakpoint
CREATE INDEX "guardian_incidents_company_type_idx" ON "guardian_incidents" USING btree ("company_id","incident_type","created_at");--> statement-breakpoint
CREATE INDEX "guardian_incidents_company_agent_idx" ON "guardian_incidents" USING btree ("company_id","agent_id","incident_type","created_at");