import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export type SocialPostStatus = "scheduled" | "published" | "failed" | "cancelled";

export interface SocialPostAnalyticsRecord {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  engagementRate?: number;
  fetchedAt?: string;
  raw?: Record<string, unknown>;
}

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    postizPostId: text("postiz_post_id"),
    platforms: jsonb("platforms").$type<string[]>().notNull(),
    content: text("content").notNull(),
    status: text("status").notNull().$type<SocialPostStatus>(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    analytics: jsonb("analytics").$type<SocialPostAnalyticsRecord>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("social_posts_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    companyStatusIdx: index("social_posts_company_status_idx").on(table.companyId, table.status),
    postizIdIdx: index("social_posts_postiz_id_idx").on(table.postizPostId),
  }),
);
