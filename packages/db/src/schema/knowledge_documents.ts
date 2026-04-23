import { pgTable, uuid, text, integer, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    category: text("category").notNull().default("other"),
    fileUrl: text("file_url").notNull(),
    fileType: text("file_type").notNull(),
    indexStatus: text("index_status", { enum: ["pending", "indexed", "failed"] }).notNull().default("pending"),
    chunksCount: integer("chunks_count").notNull().default(0),
    summary: text("summary"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyCreatedIdx: index("knowledge_documents_company_created_idx").on(table.companyId, table.createdAt),
    companyCategoryIdx: index("knowledge_documents_company_category_idx").on(table.companyId, table.category),
  }),
);
