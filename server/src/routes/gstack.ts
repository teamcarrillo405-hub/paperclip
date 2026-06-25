import { Router } from "express";
import { desc, eq, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { costEvents, gstackRunMetadata, heartbeatRuns } from "@paperclipai/db";
import { assertAuthenticated, assertCompanyAccess } from "./authz.js";
import { notFound } from "../errors.js";

export function gstackRoutes(db: Db) {
  const router = Router();

  async function getRunOrThrow(id: string) {
    const [run] = await db.select().from(heartbeatRuns).where(eq(heartbeatRuns.id, id));
    if (!run) throw notFound(`Heartbeat run ${id} not found`);
    return run;
  }

  router.post("/gstack/runs/:id/start", async (req, res) => {
    assertAuthenticated(req);
    const run = await getRunOrThrow(req.params.id);
    assertCompanyAccess(req, run.companyId);

    const { skill, budget_usd } = (req.body ?? {}) as {
      skill?: unknown;
      budget_usd?: unknown;
    };

    const [row] = await db
      .insert(gstackRunMetadata)
      .values({
        heartbeatRunId: run.id,
        skill: typeof skill === "string" ? skill : null,
        budgetUsd: typeof budget_usd === "number" ? String(budget_usd) : null,
      })
      .onConflictDoNothing()
      .returning();

    if (!row) {
      const [existing] = await db
        .select()
        .from(gstackRunMetadata)
        .where(eq(gstackRunMetadata.heartbeatRunId, run.id));
      res.status(200).json(existing ?? null);
      return;
    }

    res.status(201).json(row);
  });

  router.post("/gstack/runs/:id/spend", async (req, res) => {
    assertAuthenticated(req);
    const run = await getRunOrThrow(req.params.id);
    assertCompanyAccess(req, run.companyId);

    const { input_tokens, output_tokens } = (req.body ?? {}) as {
      input_tokens?: unknown;
      output_tokens?: unknown;
    };

    const inputTokens = typeof input_tokens === "number" ? Math.max(0, Math.floor(input_tokens)) : 0;
    const outputTokens = typeof output_tokens === "number" ? Math.max(0, Math.floor(output_tokens)) : 0;
    const costCents = Math.round(inputTokens * 0.0003 + outputTokens * 0.0015);

    const [event] = await db
      .insert(costEvents)
      .values({
        companyId: run.companyId,
        agentId: run.agentId,
        heartbeatRunId: run.id,
        provider: "claude-code",
        model: "gstack",
        biller: "gstack",
        billingType: "gstack",
        inputTokens,
        outputTokens,
        costCents,
        occurredAt: new Date(),
      })
      .returning();

    res.status(201).json(event);
  });

  router.post("/gstack/runs/:id/artifacts", async (req, res) => {
    assertAuthenticated(req);
    const run = await getRunOrThrow(req.params.id);
    assertCompanyAccess(req, run.companyId);

    const { artifact_json } = (req.body ?? {}) as { artifact_json?: unknown };
    if (!artifact_json || typeof artifact_json !== "object" || Array.isArray(artifact_json)) {
      res.status(400).json({ error: "artifact_json must be an object" });
      return;
    }

    const [row] = await db
      .update(gstackRunMetadata)
      .set({
        artifactJson: artifact_json as Record<string, unknown>,
        updatedAt: new Date(),
      })
      .where(eq(gstackRunMetadata.heartbeatRunId, run.id))
      .returning();

    if (!row) {
      res.status(404).json({ error: "No gstack metadata for this run" });
      return;
    }

    res.json(row);
  });

  router.post("/gstack/runs/:id/complete", async (req, res) => {
    assertAuthenticated(req);
    const run = await getRunOrThrow(req.params.id);
    assertCompanyAccess(req, run.companyId);

    if (run.status === "succeeded") {
      res.json(run);
      return;
    }

    const { result, skill_output } = (req.body ?? {}) as {
      result?: unknown;
      skill_output?: unknown;
    };

    const existingResult = (run.resultJson as Record<string, unknown>) ?? {};
    const mergedResult: Record<string, unknown> = {
      ...existingResult,
      ...(result && typeof result === "object" && !Array.isArray(result)
        ? (result as Record<string, unknown>)
        : {}),
    };
    if (skill_output !== undefined) {
      mergedResult.skill_output = skill_output;
    }

    const [updated] = await db
      .update(heartbeatRuns)
      .set({ resultJson: mergedResult })
      .where(eq(heartbeatRuns.id, run.id))
      .returning();

    res.json(updated ?? run);
  });

  router.get("/gstack/runs/:id/budget-status", async (req, res) => {
    assertAuthenticated(req);
    const run = await getRunOrThrow(req.params.id);
    assertCompanyAccess(req, run.companyId);

    const [meta] = await db
      .select()
      .from(gstackRunMetadata)
      .where(eq(gstackRunMetadata.heartbeatRunId, run.id));

    const [spendRow] = await db
      .select({ total: sql<string>`COALESCE(SUM(${costEvents.costCents}), 0)` })
      .from(costEvents)
      .where(eq(costEvents.heartbeatRunId, run.id));

    const spendCents = Number(spendRow?.total ?? 0);
    const spendUsd = spendCents / 100;
    const budgetUsd = meta?.budgetUsd != null ? Number(meta.budgetUsd) : null;
    const allowed = budgetUsd == null || spendUsd < budgetUsd;

    res.json({ allowed, spend_usd: spendUsd, budget_usd: budgetUsd });
  });

  router.get("/gstack/runs", async (req, res) => {
    assertAuthenticated(req);

    const companyId =
      req.actor.type === "agent"
        ? req.actor.companyId
        : req.actor.type === "board" && Array.isArray(req.actor.companyIds) && req.actor.companyIds.length > 0
          ? req.actor.companyIds[0]
          : null;

    if (!companyId) {
      res.json([]);
      return;
    }

    assertCompanyAccess(req, companyId);

    const rows = await db
      .select({
        id: gstackRunMetadata.id,
        heartbeatRunId: gstackRunMetadata.heartbeatRunId,
        skill: gstackRunMetadata.skill,
        budgetUsd: gstackRunMetadata.budgetUsd,
        artifactJson: gstackRunMetadata.artifactJson,
        createdAt: gstackRunMetadata.createdAt,
        runStatus: heartbeatRuns.status,
        runStartedAt: heartbeatRuns.startedAt,
        runFinishedAt: heartbeatRuns.finishedAt,
        agentId: heartbeatRuns.agentId,
      })
      .from(gstackRunMetadata)
      .innerJoin(heartbeatRuns, eq(gstackRunMetadata.heartbeatRunId, heartbeatRuns.id))
      .where(eq(heartbeatRuns.companyId, companyId))
      .orderBy(desc(gstackRunMetadata.createdAt))
      .limit(50);

    res.json(rows);
  });

  return router;
}
