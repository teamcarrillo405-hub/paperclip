import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export type ImageJobStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed";

export type ImageJobProvider = "dalle3" | "comfyui";

export const imageJobs = pgTable(
  "image_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    enhancedPrompt: text("enhanced_prompt"),
    style: text("style").notNull().default("photorealistic"),
    width: integer("width").notNull().default(1024),
    height: integer("height").notNull().default(1024),
    status: text("status").$type<ImageJobStatus>().notNull().default("pending"),
    imageUrl: text("image_url"),
    provider: text("provider").$type<ImageJobProvider>().notNull().default("dalle3"),
    error: text("error"),
    costCredits: integer("cost_credits").default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    companyCreatedIdx: index("image_jobs_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    companyStatusIdx: index("image_jobs_company_status_idx").on(
      table.companyId,
      table.status,
    ),
  }),
);

export type ImageJobRow = typeof imageJobs.$inferSelect;
export type NewImageJobRow = typeof imageJobs.$inferInsert;
