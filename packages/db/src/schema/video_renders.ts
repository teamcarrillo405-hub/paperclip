import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export type VideoRenderType =
  | "weekly-report"
  | "social-post"
  | "proposal"
  | "onboarding";

export type VideoRenderStatus =
  | "queued"
  | "rendering"
  | "completed"
  | "failed";

export const videoRenders = pgTable(
  "video_renders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    compositionId: text("composition_id").notNull(),
    props: jsonb("props").$type<Record<string, unknown>>().notNull().default({}),
    status: text("status").$type<VideoRenderStatus>().notNull().default("queued"),
    outputPath: text("output_path"),
    error: text("error"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    companyCreatedIdx: index("video_renders_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    companyStatusIdx: index("video_renders_company_status_idx").on(
      table.companyId,
      table.status,
    ),
  }),
);

export type VideoRenderRow = typeof videoRenders.$inferSelect;
export type NewVideoRenderRow = typeof videoRenders.$inferInsert;
