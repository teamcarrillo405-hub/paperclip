// Register in server/src/app.ts:
// import { driveSyncRoutes } from "./routes/drive-sync.js";
// api.use(driveSyncRoutes(db));

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  getDriveSyncConfig,
  saveDriveSyncConfig,
  runDriveSync,
  autoFileToDrive,
  type DriveSyncConfig,
} from "../services/drive-sync.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function driveSyncRoutes(db: Db) {
  const router = Router();

  /**
   * GET /drive-sync/config
   * Query params: companyId
   * Returns the current Drive sync configuration for the company.
   */
  router.get("/drive-sync/config", (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const config = getDriveSyncConfig(companyId);
    res.json({ config: config ?? null });
  });

  /**
   * POST /drive-sync/config
   * Body: { companyId, folderId?, mimeTypeFilter? }
   * Save (or update) the Drive sync configuration for the company.
   */
  router.post("/drive-sync/config", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const existing = getDriveSyncConfig(companyId) ?? { companyId };
    const updated: DriveSyncConfig = {
      ...existing,
      companyId,
      folderId: optionalString(body.folderId) ?? existing.folderId,
      mimeTypeFilter: optionalString(body.mimeTypeFilter) ?? existing.mimeTypeFilter,
    };

    saveDriveSyncConfig(companyId, updated);
    res.json({ config: updated });
  });

  /**
   * POST /drive-sync/run
   * Body: { companyId }
   * Run Drive sync immediately. Fetches all matching Drive documents and
   * ingests them into the knowledge base. Returns a DriveSyncResult.
   * This may take a while for large document sets — no timeout is set.
   */
  router.post("/drive-sync/run", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const result = await runDriveSync({ companyId, db });
    res.json(result);
  });

  /**
   * GET /drive-sync/status
   * Query params: companyId
   * Returns the last sync timestamp and current config.
   */
  router.get("/drive-sync/status", (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const config = getDriveSyncConfig(companyId);
    res.json({
      lastSyncAt: config?.lastSyncAt ?? null,
      config: config ?? null,
    });
  });

  /**
   * POST /drive-sync/auto-file
   * Body: { companyId, content, fileName, docType }
   * Upload a document to Avero Enterprise Drive folder structure.
   * Returns { fileId, url }.
   */
  router.post("/drive-sync/auto-file", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    const content = requireString(body.content, "content");
    const fileName = requireString(body.fileName, "fileName");
    const docType = requireString(body.docType, "docType");
    assertCompanyAccess(req, companyId);

    const result = await autoFileToDrive({ companyId, content, fileName, docType, db });
    res.json(result);
  });

  return router;
}
