import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { heartbeatRuns } from "./heartbeat_runs.js";
import { issues } from "./issues.js";

export const guardianIncidents = pgTable(
  "guardian_incidents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id),
    watchdog: text("watchdog").notNull(),
    agentId: uuid("agent_id").references(() => agents.id),
    runId: uuid("run_id").references(() => heartbeatRuns.id, { onDelete: "set null" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    incidentType: text("incident_type").notNull(),
    severity: text("severity").notNull().default("warning"),
    description: text("description").notNull(),
    recommendedAction: text("recommended_action"),
    resolved: boolean("resolved").notNull().default(false),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    autoActionTaken: text("auto_action_taken"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("guardian_incidents_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
    companyResolvedIdx: index("guardian_incidents_company_resolved_idx").on(
      table.companyId,
      table.resolved,
      table.createdAt,
    ),
    companyTypeIdx: index("guardian_incidents_company_type_idx").on(
      table.companyId,
      table.incidentType,
      table.createdAt,
    ),
    companyAgentIdx: index("guardian_incidents_company_agent_idx").on(
      table.companyId,
      table.agentId,
      table.incidentType,
      table.createdAt,
    ),
  }),
);
