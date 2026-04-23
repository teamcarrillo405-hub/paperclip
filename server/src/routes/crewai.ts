import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { crewRuns } from "@paperclipai/db";
import {
  crewService,
  createCrewToolkit,
  type CrewRunStore,
  type CrewDefinition,
  type CrewRunRecord,
} from "@paperclipai/plugin-crewai";
import { assertAuthenticated, assertCompanyAccess } from "./authz.js";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";

function resolveCompanyId(
  req: Parameters<typeof assertAuthenticated>[0],
): string | null {
  if (req.actor.type === "agent" && req.actor.companyId) return req.actor.companyId;
  if (req.actor.type === "board") {
    if (Array.isArray(req.actor.companyIds) && req.actor.companyIds.length > 0) {
      return req.actor.companyIds[0] ?? null;
    }
  }
  return null;
}

function rowToRecord(row: typeof crewRuns.$inferSelect): CrewRunRecord {
  return {
    id: row.id,
    companyId: row.companyId,
    crewName: row.crewName,
    inputs: (row.inputs as Record<string, unknown>) ?? {},
    status: row.status as CrewRunRecord["status"],
    output: row.output ?? null,
    startedAt: row.startedAt ? row.startedAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildStore(db: Db): CrewRunStore {
  return {
    async insert(record) {
      await db
        .insert(crewRuns)
        .values({
          id: record.id,
          companyId: record.companyId,
          crewName: record.crewName,
          inputs: record.inputs,
          status: record.status,
          output: record.output,
          startedAt: record.startedAt ? new Date(record.startedAt) : null,
          completedAt: record.completedAt ? new Date(record.completedAt) : null,
          createdAt: new Date(record.createdAt),
        })
        .onConflictDoNothing();
    },
    async update(id, patch) {
      const values: Record<string, unknown> = {};
      if (patch.status !== undefined) values.status = patch.status;
      if (patch.output !== undefined) values.output = patch.output;
      if (patch.completedAt !== undefined)
        values.completedAt = patch.completedAt ? new Date(patch.completedAt) : null;
      if (patch.startedAt !== undefined)
        values.startedAt = patch.startedAt ? new Date(patch.startedAt) : null;
      if (Object.keys(values).length === 0) return;
      await db.update(crewRuns).set(values).where(eq(crewRuns.id, id));
    },
    async getById(id) {
      const rows = await db
        .select()
        .from(crewRuns)
        .where(eq(crewRuns.id, id))
        .limit(1);
      return rows[0] ? rowToRecord(rows[0]) : null;
    },
    async listByCompany(companyId, limit = 20) {
      const rows = await db
        .select()
        .from(crewRuns)
        .where(eq(crewRuns.companyId, companyId))
        .orderBy(desc(crewRuns.createdAt))
        .limit(limit);
      return rows.map(rowToRecord);
    },
  };
}

let startupSweepDone = false;
async function sweepRunningOnStartup(db: Db): Promise<void> {
  if (startupSweepDone) return;
  startupSweepDone = true;
  try {
    await db
      .update(crewRuns)
      .set({
        status: "failed",
        output: "Server restarted while crew was running.",
        completedAt: new Date(),
      })
      .where(eq(crewRuns.status, "running"));
  } catch (err) {
    logger.warn({ err }, "Failed to sweep running crew runs on startup");
  }
}

export function crewaiRoutes(db: Db) {
  const router = Router();
  const store = buildStore(db);
  const toolkit = createCrewToolkit(store);

  router.use("/crews", (_req, _res, next) => {
    void sweepRunningOnStartup(db);
    next();
  });

  router.get("/crews", async (req, res) => {
    assertAuthenticated(req);
    const crews: CrewDefinition[] = crewService.listCrews();
    res.json(
      crews.map((c) => ({
        id: c.name,
        name: c.name,
        description: c.description ?? c.goal,
        goal: c.goal,
        agents: c.agents,
        tasks: c.tasks,
        inputSchema: c.inputSchema ?? [],
      })),
    );
  });

  router.post("/crews/run", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("No company context available");
    assertCompanyAccess(req, companyId);

    const body = (req.body ?? {}) as {
      crewId?: unknown;
      input?: unknown;
      inputs?: unknown;
    };
    const crewId = typeof body.crewId === "string" ? body.crewId : "";
    if (!crewId) throw badRequest("crewId is required");
    const crew = crewService.getCrew(crewId);
    if (!crew) throw notFound(`Crew not found: ${crewId}`);

    const runTool = toolkit.find((t) => t.name === "run_crew");
    if (!runTool) throw new Error("run_crew tool missing");
    const input =
      typeof body.input === "string"
        ? body.input
        : typeof body.inputs === "object" && body.inputs
          ? JSON.stringify(body.inputs)
          : "";
    const result = (await runTool.execute(
      { crewId, input },
      { companyId },
    )) as { runId: string; status: string };
    res.json(result);
  });

  router.get("/crews/runs", async (req, res) => {
    assertAuthenticated(req);
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      res.json([]);
      return;
    }
    assertCompanyAccess(req, companyId);
    const limit = Math.min(Number(req.query.limit ?? 20) || 20, 100);
    const rows = await store.listByCompany(companyId, limit);
    res.json(rows);
  });

  router.get("/crews/runs/:runId", async (req, res) => {
    assertAuthenticated(req);
    const runId = req.params.runId;
    if (!runId) throw badRequest("runId is required");
    const rec = await store.getById(runId);
    if (!rec) throw notFound("Run not found");
    const companyId = resolveCompanyId(req);
    if (companyId) assertCompanyAccess(req, rec.companyId);
    res.json(rec);
  });

  return router;
}
