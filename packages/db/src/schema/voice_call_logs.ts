import { pgTable, uuid, text, timestamp, integer, index } from "drizzle-orm/pg-core";

export const voiceCallLogs = pgTable(
  "voice_call_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: text("company_id").notNull(),
    callSid: text("call_sid").notNull(),
    direction: text("direction").notNull(),
    from: text("from").notNull(),
    to: text("to").notNull(),
    status: text("status").notNull(),
    durationSeconds: integer("duration_seconds"),
    transcript: text("transcript"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("voice_call_logs_company_id_idx").on(table.companyId),
    callSidIdx: index("voice_call_logs_call_sid_idx").on(table.callSid),
  }),
);
