ALTER TABLE "approvals" ADD COLUMN "gstack_run_id" uuid REFERENCES "heartbeat_runs"("id") ON DELETE SET NULL;--> statement-breakpoint
CREATE INDEX "approvals_gstack_run_id_idx" ON "approvals" ("gstack_run_id") WHERE "gstack_run_id" IS NOT NULL;
