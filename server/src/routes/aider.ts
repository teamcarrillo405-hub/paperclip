import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { aiderRuns } from "@paperclipai/db";
import {
  AiderExecutionError,
  AiderNotInstalledError,
  AiderService,
} from "@paperclipai/plugin-aider";
import { assertAuthenticated, assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";
import { logger } from "../middleware/logger.js";

function isEnabled(): boolean {
  return process.env.AIDER_ENABLED === "true";
}

function resolveCompanyId(req: Parameters<typeof assertAuthenticated>[0]): string | null {
  if (req.actor.type === "agent" && req.actor.companyId) return req.actor.companyId;
  if (req.actor.type === "board") {
    if (Array.isArray(req.actor.companyIds) && req.actor.companyIds.length > 0) {
      return req.actor.companyIds[0] ?? null;
    }
  }
  return null;
}

export function aiderRoutes(db: Db) {
  const router = Router();

  router.use("/aider", (_req, res, next) => {
    if (!isEnabled()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  });

  router.get("/aider/status", async (req, res) => {
    assertAuthenticated(req);
    const service = new AiderService();
    res.json({
      installed: service.isInstalled(),
      model: service.getModel(),
      autoFixEnabled: process.env.AIDER_AUTO_FIX_ENABLED === "true",
      enabled: true,
    });
  });

  router.get("/aider/history", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      res.json([]);
      return;
    }
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select()
      .from(aiderRuns)
      .where(eq(aiderRuns.companyId, companyId))
      .orderBy(desc(aiderRuns.createdAt))
      .limit(50);
    res.json(rows);
  });

  router.post("/aider/fix", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("No company context available");
    assertCompanyAccess(req, companyId);

    const { description, files, createBranch } = (req.body ?? {}) as {
      description?: unknown;
      files?: unknown;
      createBranch?: unknown;
    };
    if (typeof description !== "string" || description.length === 0) {
      throw badRequest("description is required");
    }
    const fileList: string[] = Array.isArray(files)
      ? files.filter((f): f is string => typeof f === "string" && f.length > 0)
      : [];
    const wantsBranch = createBranch === true;

    const [inserted] = await db
      .insert(aiderRuns)
      .values({
        companyId,
        description,
        files: fileList,
        status: "running",
      })
      .returning();

    if (!inserted) {
      res.status(500).json({ error: "Failed to record aider run" });
      return;
    }

    const service = new AiderService();
    try {
      if (wantsBranch) {
        const result = await service.createBranchAndFix({
          issueDescription: description,
          files: fileList,
        });
        const [updated] = await db
          .update(aiderRuns)
          .set({
            status: "complete",
            diff: result.diff,
            branchName: result.branchName,
            commitHash: result.commitHash,
            updatedAt: new Date(),
          })
          .where(eq(aiderRuns.id, inserted.id))
          .returning();
        res.json(updated ?? inserted);
        return;
      }

      const result = await service.fixBug({ description, files: fileList });
      const [updated] = await db
        .update(aiderRuns)
        .set({
          status: "complete",
          diff: result.diff,
          updatedAt: new Date(),
        })
        .where(eq(aiderRuns.id, inserted.id))
        .returning();
      res.json(updated ?? inserted);
    } catch (err) {
      const message =
        err instanceof AiderNotInstalledError
          ? `${err.message} (run: pip install aider-chat)`
          : err instanceof AiderExecutionError
            ? `Aider error (exit ${err.exitCode}): ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
      logger.error({ err, runId: inserted.id }, "Aider fix failed");
      await db
        .update(aiderRuns)
        .set({ status: "failed", errorMessage: message, updatedAt: new Date() })
        .where(eq(aiderRuns.id, inserted.id));
      res.status(err instanceof AiderNotInstalledError ? 501 : 500).json({
        error: message,
        runId: inserted.id,
      });
    }
  });

  return router;
}
