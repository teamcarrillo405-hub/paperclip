import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const gustoOAuthTokens = pgTable("gusto_oauth_tokens", {
  companyId: uuid("company_id").primaryKey().references(() => companies.id, { onDelete: "cascade" }),
  accessToken: text("access_token").notNull(),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  tokenType: text("token_type").notNull().default("Bearer"),
  gustoCompanyUuid: text("gusto_company_uuid").notNull(),
  gustoCompanyName: text("gusto_company_name").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
