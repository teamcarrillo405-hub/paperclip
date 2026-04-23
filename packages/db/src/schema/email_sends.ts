import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";

export const emailSends = pgTable(
  "email_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull(),
    to: text("to").notNull(),
    from: text("from").notNull(),
    subject: text("subject").notNull(),
    templateName: text("template_name"),
    status: text("status").notNull().default("sent"),
    messageId: text("message_id"),
    provider: text("provider").notNull().default("postal"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdIdx: index("email_sends_company_id_idx").on(table.companyId),
    createdAtIdx: index("email_sends_created_at_idx").on(table.createdAt),
  }),
);

export type EmailSendRow = typeof emailSends.$inferSelect;
export type NewEmailSendRow = typeof emailSends.$inferInsert;
