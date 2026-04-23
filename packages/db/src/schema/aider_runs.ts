import { pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export type AiderRunStatus = "pending" | "running" | "complete" | "failed";

export const aiderRuns = pgTable(
  "aider_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: text("company_id").notNull(),
    description: text("description").notNull(),
    files: jsonb("files").$type<string[]>().notNull().default([]),
    status: text("status").$type<AiderRunStatus>().notNull().default("pending"),
    diff: text("diff"),
    branchName: text("branch_name"),
    commitHash: text("commit_hash"),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("aider_runs_company_id_idx").on(table.companyId),
    createdAtIdx: index("aider_runs_created_at_idx").on(table.createdAt),
  }),
);

export type AiderRunRow = typeof aiderRuns.$inferSelect;
export type NewAiderRunRow = typeof aiderRuns.$inferInsert;
