CREATE TABLE "aider_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" text NOT NULL,
	"description" text NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"diff" text,
	"branch_name" text,
	"commit_hash" text,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "aider_runs_company_id_idx" ON "aider_runs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "aider_runs_created_at_idx" ON "aider_runs" USING btree ("created_at");
