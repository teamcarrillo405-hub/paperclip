import {
  pgTable,
  uuid,
  text,
  jsonb,
  timestamp,
  doublePrecision,
  index,
} from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export interface CustomerMemoryEntry {
  type: "note" | "interaction" | "system";
  summary: string;
  date: string;
  createdAt: string;
  channel?: string;
}

export const customerMemories = pgTable(
  "customer_memories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    customerId: text("customer_id"),
    customerName: text("customer_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    memories: jsonb("memories")
      .$type<CustomerMemoryEntry[]>()
      .notNull()
      .default([]),
    sentimentScore: doublePrecision("sentiment_score"),
    lifetimeValue: doublePrecision("lifetime_value").notNull().default(0),
    lastInteractionAt: timestamp("last_interaction_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("customer_memories_company_idx").on(table.companyId),
    emailIdx: index("customer_memories_email_idx").on(table.email),
  }),
);
