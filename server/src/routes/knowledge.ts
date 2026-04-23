import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  kbGeneratedDocuments,
  kbIngestedDocuments,
  type Db,
} from "@paperclipai/db";
import {
  KnowledgeService,
  inMemoryKnowledgeStore,
  type GeneratedDoc,
  type KnowledgeDocument,
  type KnowledgeStore,
} from "@paperclipai/plugin-knowledge-base";
import { badRequest, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function createDbStore(db: Db): KnowledgeStore {
  return {
    async insertIngested(doc) {
      await db.insert(kbIngestedDocuments).values({
        id: doc.id,
        companyId: doc.companyId,
        title: doc.title,
        content: doc.content,
        source: doc.source,
        docType: doc.docType,
        createdAt: new Date(doc.createdAt),
        updatedAt: new Date(doc.createdAt),
      });
    },
    async deleteIngested(companyId, docId) {
      const result = await db
        .delete(kbIngestedDocuments)
        .where(
          and(
            eq(kbIngestedDocuments.id, docId),
            eq(kbIngestedDocuments.companyId, companyId),
          ),
        )
        .returning({ id: kbIngestedDocuments.id });
      return result.length > 0;
    },
    async listIngested(companyId) {
      const rows = await db
        .select()
        .from(kbIngestedDocuments)
        .where(eq(kbIngestedDocuments.companyId, companyId))
        .orderBy(desc(kbIngestedDocuments.createdAt));
      return rows.map(
        (row): KnowledgeDocument => ({
          id: row.id,
          companyId: row.companyId,
          title: row.title,
          content: row.content,
          source: row.source,
          docType: row.docType,
          createdAt: row.createdAt.toISOString(),
        }),
      );
    },
    async insertGenerated(doc) {
      await db.insert(kbGeneratedDocuments).values({
        id: doc.id,
        companyId: doc.companyId,
        title: doc.title,
        content: doc.content,
        docType: doc.docType,
        sourceDocIds: [],
        createdAt: new Date(doc.createdAt),
      });
    },
    async listGenerated(companyId) {
      const rows = await db
        .select()
        .from(kbGeneratedDocuments)
        .where(eq(kbGeneratedDocuments.companyId, companyId))
        .orderBy(desc(kbGeneratedDocuments.createdAt));
      return rows.map(
        (row): GeneratedDoc => ({
          id: row.id,
          companyId: row.companyId,
          title: row.title,
          content: row.content,
          docType: row.docType,
          createdAt: row.createdAt.toISOString(),
        }),
      );
    },
    async getGenerated(companyId, id) {
      const rows = await db
        .select()
        .from(kbGeneratedDocuments)
        .where(
          and(
            eq(kbGeneratedDocuments.id, id),
            eq(kbGeneratedDocuments.companyId, companyId),
          ),
        )
        .limit(1);
      const row = rows[0];
      if (!row) return null;
      return {
        id: row.id,
        companyId: row.companyId,
        title: row.title,
        content: row.content,
        docType: row.docType,
        createdAt: row.createdAt.toISOString(),
      };
    },
  };
}

export function knowledgeRoutes(db: Db) {
  const router = Router();
  const store: KnowledgeStore = db ? createDbStore(db) : inMemoryKnowledgeStore;
  const service = new KnowledgeService(store);

  router.get("/knowledge/documents", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const docs = await service.listDocuments(companyId);
    res.json(docs);
  });

  router.post("/knowledge/ingest", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const title = requireString(body.title, "title");
    const content = requireString(body.content, "content");
    const source = optionalString(body.source);
    const docType = optionalString(body.docType) ?? "general";
    const doc = await service.ingestDocument(companyId, title, content, source, docType);
    res.status(201).json(doc);
  });

  router.post("/knowledge/query", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const query = requireString(body.query, "query");
    const topK = optionalNumber(body.topK) ?? 5;
    const results = await service.queryKnowledge(companyId, query, topK);
    res.json({ results });
  });

  router.post("/knowledge/generate", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const docType = requireString(body.docType, "docType");
    const title = requireString(body.title, "title");
    const rawContext = body.context;
    const context =
      typeof rawContext === "string"
        ? { topic: rawContext }
        : rawContext && typeof rawContext === "object"
          ? (rawContext as Record<string, string>)
          : {};
    const doc = await service.generateDocument(companyId, docType, title, context);
    res.status(201).json(doc);
  });

  router.get("/knowledge/generated", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const docs = await service.listGeneratedDocuments(companyId);
    res.json(docs);
  });

  router.get("/knowledge/generated/:id", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const id = requireString(req.params.id, "id");
    const doc = await service.getGeneratedDocument(companyId, id);
    if (!doc) throw notFound(`Generated document ${id} not found`);
    res.json(doc);
  });

  router.delete("/knowledge/documents/:id", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const id = requireString(req.params.id, "id");
    const removed = await service.deleteDocument(companyId, id);
    if (!removed) throw notFound(`Document ${id} not found`);
    res.status(204).end();
  });

  return router;
}
