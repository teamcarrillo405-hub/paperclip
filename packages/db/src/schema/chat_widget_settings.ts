import { boolean, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const chatWidgetSettings = pgTable(
  "chat_widget_settings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    welcomeMessage: text("welcome_message").notNull().default("Hi! How can we help you today?"),
    agentName: text("agent_name").notNull().default("Avero AI"),
    brandColor: text("brand_color").notNull().default("#2563eb"),
    collectEmail: boolean("collect_email").notNull().default(true),
    collectPhone: boolean("collect_phone").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdUniqueIdx: uniqueIndex("chat_widget_settings_company_id_idx").on(table.companyId),
  }),
);
