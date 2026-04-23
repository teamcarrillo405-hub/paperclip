import { pgTable, uuid, text, timestamp, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const billingSubscriptions = pgTable(
  "billing_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    planId: text("plan_id").notNull(),
    status: text("status").notNull(),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdUniqueIdx: uniqueIndex("billing_subscriptions_company_id_idx").on(table.companyId),
    stripeCustomerIdUniqueIdx: uniqueIndex("billing_subscriptions_stripe_customer_id_idx").on(
      table.stripeCustomerId,
    ),
    stripeSubscriptionIdUniqueIdx: uniqueIndex("billing_subscriptions_stripe_subscription_id_idx").on(
      table.stripeSubscriptionId,
    ),
  }),
);
