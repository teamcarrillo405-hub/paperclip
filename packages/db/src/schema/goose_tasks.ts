import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export type GooseTaskStatus = "running" | "completed" | "failed" | "cancelled";

export const gooseTasks = pgTable(
  "goose_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: text("company_id").notNull(),
    templateName: text("template_name"),
    instructions: text("instructions").notNull(),
    status: text("status").$type<GooseTaskStatus>().notNull().default("running"),
    output: text("output"),
    durationMs: integer("duration_ms"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("goose_tasks_company_id_idx").on(table.companyId),
    createdAtIdx: index("goose_tasks_created_at_idx").on(table.createdAt),
  }),
);

export type GooseTaskRow = typeof gooseTasks.$inferSelect;
export type NewGooseTaskRow = typeof gooseTasks.$inferInsert;
