// Register in server/src/app.ts:
// import { slidesRoutes } from "./routes/slides.js";
// api.use(slidesRoutes(db));

import fs from "node:fs";
import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  generatePresentation,
  listPresentations,
  deletePresentation,
  type PresentationRequest,
} from "../services/slides-generator.js";

const DOC_TYPES = [
  "business-proposal",
  "status-report",
  "strategy",
  "onboarding",
  "general",
] as const;

type DocType = (typeof DOC_TYPES)[number];

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function resolveCompanyId(req: import("express").Request): string {
  const q = req.query.companyId ?? req.query.company_id;
  if (typeof q === "string" && q.length > 0) return q;
  if (req.actor.type === "agent" && req.actor.companyId) {
    return req.actor.companyId;
  }
  if (
    req.actor.type === "board" &&
    Array.isArray(req.actor.companyIds) &&
    req.actor.companyIds.length > 0
  ) {
    return req.actor.companyIds[0];
  }
  throw badRequest("companyId is required");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function slidesRoutes(_db: Db) {
  const router = Router();

  // GET /slides — list presentations for a company
  router.get("/slides", async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const results = listPresentations(companyId);
    res.json({ presentations: results });
  });

  // POST /slides/generate — generate a new presentation
  router.post("/slides/generate", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const title = requireString(body.title, "title");
    const topic = requireString(body.topic, "topic");

    const rawDocType = body.docType;
    if (!DOC_TYPES.includes(rawDocType as DocType)) {
      throw badRequest(
        `docType must be one of: ${DOC_TYPES.join(", ")}`,
      );
    }
    const docType = rawDocType as DocType;

    const slideCountRaw =
      typeof body.slideCount === "number"
        ? body.slideCount
        : typeof body.slideCount === "string"
          ? Number(body.slideCount)
          : 8;
    const slideCount = Number.isFinite(slideCountRaw)
      ? Math.max(5, Math.min(20, slideCountRaw))
      : 8;

    const presentationReq: PresentationRequest = {
      title,
      topic,
      docType,
      slideCount,
      subtitle:
        typeof body.subtitle === "string" && body.subtitle.length > 0
          ? body.subtitle
          : undefined,
      companyName:
        typeof body.companyName === "string" && body.companyName.length > 0
          ? body.companyName
          : undefined,
      accentColor:
        typeof body.accentColor === "string" && body.accentColor.length > 0
          ? body.accentColor
          : undefined,
    };

    const result = await generatePresentation(presentationReq, companyId);
    res.json(result);
  });

  // GET /slides/:id/download — stream PPTX file
  router.get("/slides/:id/download", async (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const { id } = req.params;
    const presentations = listPresentations(companyId);
    const entry = presentations.find((p) => p.id === id);

    if (!entry) {
      throw notFound("Presentation not found");
    }

    if (!fs.existsSync(entry.filePath)) {
      throw notFound("Presentation file not found on disk");
    }

    const safeTitle = entry.title.replace(/[^a-zA-Z0-9\s-_]/g, "").trim() || "presentation";
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${safeTitle}.pptx"`,
    );

    const stream = fs.createReadStream(entry.filePath);
    stream.pipe(res);
  });

  // DELETE /slides/:id — delete a presentation
  router.delete("/slides/:id", (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const { id } = req.params;
    const presentations = listPresentations(companyId);
    const entry = presentations.find((p) => p.id === id);

    if (!entry) {
      throw notFound("Presentation not found");
    }

    deletePresentation(companyId, id);
    res.status(204).end();
  });

  return router;
}
