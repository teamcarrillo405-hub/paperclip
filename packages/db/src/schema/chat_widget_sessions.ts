import { boolean, index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export type ChatWidgetMessage = {
  role: "visitor" | "agent" | "system";
  content: string;
  createdAt: string;
};

export const chatWidgetSessions = pgTable(
  "chat_widget_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    sessionId: uuid("session_id").notNull().defaultRandom(),
    visitorName: text("visitor_name"),
    visitorEmail: text("visitor_email"),
    visitorPhone: text("visitor_phone"),
    pageUrl: text("page_url"),
    messages: jsonb("messages").$type<ChatWidgetMessage[]>().notNull().default([]),
    leadCaptured: boolean("lead_captured").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    sessionIdUniqueIdx: uniqueIndex("chat_widget_sessions_session_id_idx").on(table.sessionId),
    companyCreatedIdx: index("chat_widget_sessions_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    companyLeadIdx: index("chat_widget_sessions_company_lead_idx").on(
      table.companyId,
      table.leadCaptured,
    ),
  }),
);
