import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { gooseTasks, type GooseTaskStatus as DbGooseTaskStatus } from "@paperclipai/db";
import {
  GooseService,
  GooseNotInstalledError,
  TASK_TEMPLATES,
  TASK_TEMPLATE_NAMES,
  isGooseInstalled,
  isTaskTemplateName,
  renderTemplate,
  type GooseTaskPersistence,
  type GooseTaskRecord,
  type GooseTaskStatus,
  type TaskTemplateName,
} from "@paperclipai/plugin-goose";
import { assertAuthenticated, assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";

function isEnabled(): boolean {
  return process.env.GOOSE_ENABLED === "true";
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

function rowToRecord(row: typeof gooseTasks.$inferSelect): GooseTaskRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    instructions: row.instructions,
    templateName: row.templateName,
    status: row.status as GooseTaskStatus,
    output: row.output ?? "",
    startedAt: row.startedAt ?? row.createdAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
  };
}

function buildPersistence(db: Db): GooseTaskPersistence {
  return {
    async insertRunning(task) {
      await db
        .insert(gooseTasks)
        .values({
          id: task.id,
          companyId: task.companyId,
          instructions: task.instructions,
          templateName: task.templateName ?? null,
          status: task.status as DbGooseTaskStatus,
          output: task.output,
          startedAt: task.startedAt,
          completedAt: task.completedAt,
          createdAt: task.createdAt,
        })
        .onConflictDoNothing();
    },
    async appendOutput(taskId, output) {
      await db
        .update(gooseTasks)
        .set({ output })
        .where(eq(gooseTasks.id, taskId));
    },
    async finalize(taskId, patch) {
      const started = (
        await db.select({ startedAt: gooseTasks.startedAt }).from(gooseTasks).where(eq(gooseTasks.id, taskId))
      )[0];
      const durationMs =
        started?.startedAt instanceof Date
          ? patch.completedAt.getTime() - started.startedAt.getTime()
          : null;
      await db
        .update(gooseTasks)
        .set({
          status: patch.status as DbGooseTaskStatus,
          output: patch.output,
          completedAt: patch.completedAt,
          durationMs,
        })
        .where(eq(gooseTasks.id, taskId));
    },
    async findById(taskId) {
      const rows = await db
        .select()
        .from(gooseTasks)
        .where(eq(gooseTasks.id, taskId))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async listByCompany(companyId, opts) {
      const limit = opts?.limit ?? 50;
      const where = opts?.status
        ? and(eq(gooseTasks.companyId, companyId), eq(gooseTasks.status, opts.status as DbGooseTaskStatus))
        : eq(gooseTasks.companyId, companyId);
      const rows = await db
        .select()
        .from(gooseTasks)
        .where(where)
        .orderBy(desc(gooseTasks.createdAt))
        .limit(limit);
      return rows.map(rowToRecord);
    },
  };
}

let startupSweepDone = false;
async function markRunningAsFailedOnStartup(db: Db): Promise<void> {
  if (startupSweepDone) return;
  startupSweepDone = true;
  try {
    await db
      .update(gooseTasks)
      .set({
        status: "failed" as DbGooseTaskStatus,
        output: "Server restarted while task was running.",
        completedAt: new Date(),
      })
      .where(eq(gooseTasks.status, "running"));
  } catch (err) {
    logger.warn({ err }, "Failed to sweep running goose tasks on startup");
  }
}

export function gooseRoutes(db: Db) {
  const router = Router();
  const persistence = buildPersistence(db);
  const service = new GooseService({
    persistence,
    binary: process.env.GOOSE_BIN,
  });

  router.use("/goose", (_req, res, next) => {
    if (!isEnabled()) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    void markRunningAsFailedOnStartup(db);
    next();
  });

  router.get("/goose/status", async (req, res) => {
    assertAuthenticated(req);
    res.json({
      installed: isGooseInstalled(process.env.GOOSE_BIN ?? "goose"),
      templates: TASK_TEMPLATE_NAMES,
      templateDetails: TASK_TEMPLATES,
      enabled: true,
    });
  });

  router.get("/goose/tasks", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      res.json([]);
      return;
    }
    assertCompanyAccess(req, companyId);
    const rows = await persistence.listByCompany(companyId, { limit: 50 });
    res.json(rows);
  });

  router.get("/goose/tasks/:id", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    const id = req.params.id;
    if (!id) throw badRequest("id is required");
    const record = await service.getTask(id);
    if (!record) throw notFound("Task not found");
    if (companyId) assertCompanyAccess(req, record.companyId);
    res.json(record);
  });

  router.post("/goose/tasks", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("No company context available");
    assertCompanyAccess(req, companyId);

    const body = (req.body ?? {}) as {
      instructions?: unknown;
      templateName?: unknown;
      variables?: unknown;
      context?: unknown;
    };

    let instructions: string | undefined;
    let templateName: TaskTemplateName | undefined;
    if (typeof body.templateName === "string" && body.templateName.length > 0) {
      if (!isTaskTemplateName(body.templateName)) {
        throw badRequest(
          `templateName must be one of: ${TASK_TEMPLATE_NAMES.join(", ")}`,
        );
      }
      templateName = body.templateName;
      const variables =
        body.variables && typeof body.variables === "object"
          ? Object.fromEntries(
              Object.entries(body.variables as Record<string, unknown>).filter(
                ([, v]) => typeof v === "string",
              ) as Array<[string, string]>,
            )
          : undefined;
      instructions = renderTemplate(templateName, variables);
    } else if (typeof body.instructions === "string" && body.instructions.length > 0) {
      instructions = body.instructions;
    } else {
      throw badRequest("Either instructions or templateName is required");
    }

    const context =
      typeof body.context === "string" && body.context.length > 0 ? body.context : undefined;

    try {
      const rec = await service.startTask({
        instructions,
        context,
        companyId,
        templateName,
      });
      res.json(rec);
    } catch (err) {
      if (err instanceof GooseNotInstalledError) {
        res.status(501).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  router.delete("/goose/tasks/:id", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    const id = req.params.id;
    if (!id) throw badRequest("id is required");
    const existing = await service.getTask(id);
    if (!existing) throw notFound("Task not found");
    if (companyId) assertCompanyAccess(req, existing.companyId);
    const rec = await service.cancelTask(id);
    res.json(rec ?? existing);
  });

  return router;
}
