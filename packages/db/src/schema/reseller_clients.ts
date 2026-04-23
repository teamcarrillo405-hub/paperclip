import { pgTable, uuid, text, timestamp, integer, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { resellerPartners } from "./reseller_partners.js";

export const resellerClients = pgTable(
  "reseller_clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    resellerId: uuid("reseller_id")
      .notNull()
      .references(() => resellerPartners.id, { onDelete: "cascade" }),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stripeSubscriptionId: text("stripe_subscription_id"),
    commissionPercent: integer("commission_percent").notNull().default(20),
    activeAt: timestamp("active_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyUniqueIdx: uniqueIndex("reseller_clients_company_id_idx").on(table.companyId),
    resellerIdx: index("reseller_clients_reseller_id_idx").on(table.resellerId),
    subscriptionIdx: index("reseller_clients_subscription_id_idx").on(table.stripeSubscriptionId),
  }),
);
