import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export type MarketingCampaignStatus =
  | "draft"
  | "generating"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface MarketingCampaignAsset {
  kind: "image" | "video" | "audio" | "text";
  url?: string;
  caption?: string;
  platform?: string;
  mimeType?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface MarketingCampaignAssets {
  images?: MarketingCampaignAsset[];
  videos?: MarketingCampaignAsset[];
  audio?: MarketingCampaignAsset[];
  text?: MarketingCampaignAsset[];
  logs?: string[];
}

export const marketingCampaigns = pgTable(
  "marketing_campaigns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    name: text("name").notNull(),
    topic: text("topic").notNull(),
    platforms: text("platforms").array().notNull().default([]),
    status: text("status").$type<MarketingCampaignStatus>().notNull().default("draft"),
    assets: jsonb("assets").$type<MarketingCampaignAssets>().notNull().default({}),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("marketing_campaigns_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    companyStatusIdx: index("marketing_campaigns_company_status_idx").on(
      table.companyId,
      table.status,
    ),
  }),
);
