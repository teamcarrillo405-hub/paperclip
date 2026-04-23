import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export type CrewRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export const crewRuns = pgTable(
  "crew_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    crewName: text("crew_name").notNull(),
    inputs: jsonb("inputs").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<CrewRunStatus>().notNull().default("pending"),
    output: text("output"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("crew_runs_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    companyStatusIdx: index("crew_runs_company_status_idx").on(
      table.companyId,
      table.status,
    ),
  }),
);

export type CrewRunRow = typeof crewRuns.$inferSelect;
export type NewCrewRunRow = typeof crewRuns.$inferInsert;
