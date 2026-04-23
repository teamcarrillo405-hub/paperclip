import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    userId: text("user_id"),
    agentId: uuid("agent_id").references(() => agents.id),
    action: text("action").notNull(),
    resource: text("resource").notNull(),
    resourceId: text("resource_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ipAddress: text("ip_address"),
    outcome: text("outcome").notNull(),
    riskLevel: text("risk_level").notNull().default("low"),
    piiDetected: boolean("pii_detected").notNull().default(false),
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyTimestampIdx: index("audit_log_company_timestamp_idx").on(
      table.companyId,
      table.timestamp,
    ),
  }),
);
