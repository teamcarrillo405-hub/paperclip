// Register in server/src/app.ts:
// import { notebookRoutes } from "./routes/notebook.js";
// api.use(notebookRoutes(db));

import { Router } from "express";
import { type Db } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  createNotebook,
  listNotebooks,
  getNotebook,
  deleteNotebook,
  addSource,
  listSources,
  removeSource,
  fetchUrlContent,
  queryNotebook,
} from "../services/notebook.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function notebookRoutes(_db: Db) {
  const router = Router();

  // GET /notebooks — list all notebooks for a company
  router.get("/notebooks", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebooks = listNotebooks(companyId);
    res.json(notebooks);
  });

  // POST /notebooks — create notebook
  router.post("/notebooks", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const name = requireString(body.name, "name");
    const description = optionalString(body.description);
    const notebook = createNotebook(companyId, name, description);
    res.status(201).json(notebook);
  });

  // GET /notebooks/:notebookId — get notebook with its sources
  router.get("/notebooks/:notebookId", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebookId = requireString(req.params.notebookId, "notebookId");
    const notebook = getNotebook(companyId, notebookId);
    if (!notebook) throw notFound(`Notebook ${notebookId} not found`);
    const sources = listSources(companyId, notebookId);
    res.json({ ...notebook, sources });
  });

  // DELETE /notebooks/:notebookId — delete notebook
  router.delete("/notebooks/:notebookId", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebookId = requireString(req.params.notebookId, "notebookId");
    const notebook = getNotebook(companyId, notebookId);
    if (!notebook) throw notFound(`Notebook ${notebookId} not found`);
    deleteNotebook(companyId, notebookId);
    res.status(204).end();
  });

  // GET /notebooks/:notebookId/sources — list sources
  router.get("/notebooks/:notebookId/sources", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebookId = requireString(req.params.notebookId, "notebookId");
    const notebook = getNotebook(companyId, notebookId);
    if (!notebook) throw notFound(`Notebook ${notebookId} not found`);
    const sources = listSources(companyId, notebookId);
    res.json(sources);
  });

  // POST /notebooks/:notebookId/sources — add a source
  router.post("/notebooks/:notebookId/sources", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebookId = requireString(req.params.notebookId, "notebookId");
    const notebook = getNotebook(companyId, notebookId);
    if (!notebook) throw notFound(`Notebook ${notebookId} not found`);

    const rawType = body.type;
    const validTypes = new Set(["text", "url", "pdf", "drive-doc"]);
    if (typeof rawType !== "string" || !validTypes.has(rawType)) {
      throw badRequest("type must be one of: text, url, pdf, drive-doc");
    }
    const sourceType = rawType as "text" | "url" | "pdf" | "drive-doc";
    const title = requireString(body.title, "title");
    const sourceUrl = optionalString(body.sourceUrl);

    let content = optionalString(body.content) ?? "";

    if (sourceType === "url" && !content) {
      if (!sourceUrl) throw badRequest("sourceUrl is required when type is url and no content provided");
      content = await fetchUrlContent(sourceUrl);
    }

    if (!content) throw badRequest("content is required");

    const source = addSource(companyId, notebookId, {
      companyId,
      notebookId,
      type: sourceType,
      title,
      content,
      sourceUrl,
    });

    res.status(201).json(source);
  });

  // DELETE /notebooks/:notebookId/sources/:sourceId — remove source
  router.delete("/notebooks/:notebookId/sources/:sourceId", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebookId = requireString(req.params.notebookId, "notebookId");
    const sourceId = requireString(req.params.sourceId, "sourceId");
    const notebook = getNotebook(companyId, notebookId);
    if (!notebook) throw notFound(`Notebook ${notebookId} not found`);
    removeSource(companyId, notebookId, sourceId);
    res.status(204).end();
  });

  // POST /notebooks/:notebookId/query — query notebook
  router.post("/notebooks/:notebookId/query", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebookId = requireString(req.params.notebookId, "notebookId");
    const question = requireString(body.question, "question");
    const notebook = getNotebook(companyId, notebookId);
    if (!notebook) throw notFound(`Notebook ${notebookId} not found`);
    const result = await queryNotebook(companyId, notebookId, question);
    res.json(result);
  });

  // POST /notebooks/:notebookId/ingest-to-kb — ingest all sources into the main KB
  router.post("/notebooks/:notebookId/ingest-to-kb", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const notebookId = requireString(req.params.notebookId, "notebookId");
    const notebook = getNotebook(companyId, notebookId);
    if (!notebook) throw notFound(`Notebook ${notebookId} not found`);
    const sources = listSources(companyId, notebookId);

    const port = process.env.PORT ?? "3100";
    const ingestUrl = `http://localhost:${port}/api/knowledge/ingest`;
    const results: Array<{ sourceId: string; title: string; success: boolean; error?: string }> = [];

    for (const source of sources) {
      try {
        const response = await fetch(ingestUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId,
            title: source.title,
            content: source.content,
            source: source.sourceUrl ?? `notebook:${notebookId}`,
            docType: "general",
          }),
        });
        if (response.ok) {
          results.push({ sourceId: source.id, title: source.title, success: true });
        } else {
          const errText = await response.text().catch(() => "unknown error");
          results.push({ sourceId: source.id, title: source.title, success: false, error: errText });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        results.push({ sourceId: source.id, title: source.title, success: false, error: message });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    res.json({ ingestedCount: successCount, totalSources: sources.length, results });
  });

  return router;
}
