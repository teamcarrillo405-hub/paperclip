import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const kbIngestedDocuments = pgTable(
  "kb_ingested_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    source: text("source"),
    docType: text("doc_type").notNull().default("general"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("kb_ingested_documents_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
  }),
);

export const kbGeneratedDocuments = pgTable(
  "kb_generated_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    docType: text("doc_type").notNull(),
    sourceDocIds: text("source_doc_ids").array(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("kb_generated_documents_company_created_idx").on(
      table.companyId,
      table.createdAt,
    ),
  }),
);
