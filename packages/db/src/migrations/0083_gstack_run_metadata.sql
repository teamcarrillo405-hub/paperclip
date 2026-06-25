CREATE TABLE IF NOT EXISTS gstack_run_metadata (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  heartbeat_run_id UUID         NOT NULL REFERENCES heartbeat_runs(id) ON DELETE CASCADE,
  skill           TEXT,
  budget_usd      NUMERIC(10,4),
  artifact_json   JSONB         NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
--> statement-breakpoint
CREATE UNIQUE INDEX gstack_run_metadata_heartbeat_run_idx
  ON gstack_run_metadata(heartbeat_run_id);
