CREATE TABLE "goose_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"template_name" text,
	"instructions" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"output" text,
	"duration_ms" integer,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "goose_tasks_company_id_idx" ON "goose_tasks" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "goose_tasks_created_at_idx" ON "goose_tasks" USING btree ("created_at");
