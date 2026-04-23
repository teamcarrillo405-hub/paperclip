import { pgTable, uuid, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";

export const resellerPartners = pgTable(
  "reseller_partners",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    partnerCode: text("partner_code").notNull(),
    stripeConnectAccountId: text("stripe_connect_account_id"),
    stripeConnectStatus: text("stripe_connect_status").notNull().default("pending"),
    commissionPercent: integer("commission_percent").notNull().default(20),
    totalClientCount: integer("total_client_count").notNull().default(0),
    totalMrrCents: integer("total_mrr_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUniqueIdx: uniqueIndex("reseller_partners_email_idx").on(table.email),
    partnerCodeUniqueIdx: uniqueIndex("reseller_partners_partner_code_idx").on(table.partnerCode),
    stripeAccountUniqueIdx: uniqueIndex("reseller_partners_stripe_account_idx").on(
      table.stripeConnectAccountId,
    ),
  }),
);
