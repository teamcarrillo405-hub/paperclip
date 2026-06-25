import { jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { heartbeatRuns } from "./heartbeat_runs.js";

export const gstackRunMetadata = pgTable(
  "gstack_run_metadata",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    heartbeatRunId: uuid("heartbeat_run_id")
      .notNull()
      .references(() => heartbeatRuns.id, { onDelete: "cascade" }),
    skill: text("skill"),
    budgetUsd: numeric("budget_usd", { precision: 10, scale: 4 }),
    artifactJson: jsonb("artifact_json")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    heartbeatRunIdx: uniqueIndex("gstack_run_metadata_heartbeat_run_idx").on(table.heartbeatRunId),
  }),
);
