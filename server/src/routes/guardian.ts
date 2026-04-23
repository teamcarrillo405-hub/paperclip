import { Router } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, guardianIncidents } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import type { GuardianScheduler } from "../services/guardian-scheduler.js";

export function guardianRoutes(db: Db, scheduler: GuardianScheduler) {
  const router = Router();

  router.get("/guardian/status", async (_req, res) => {
    res.json(scheduler.getStatus());
  });

  router.get("/guardian/incidents", async (req, res) => {
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : null;
    if (!companyId) throw badRequest("companyId query parameter is required");
    assertCompanyAccess(req, companyId);

    const limitRaw = typeof req.query.limit === "string" ? parseInt(req.query.limit, 10) : 50;
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 50;

    const resolvedRaw = typeof req.query.resolved === "string" ? req.query.resolved : null;
    const conditions = [eq(guardianIncidents.companyId, companyId)];
    if (resolvedRaw === "true") conditions.push(eq(guardianIncidents.resolved, true));
    else if (resolvedRaw === "false") conditions.push(eq(guardianIncidents.resolved, false));

    const rows = await db
      .select({
        incident: guardianIncidents,
        agentName: agents.name,
      })
      .from(guardianIncidents)
      .leftJoin(agents, eq(guardianIncidents.agentId, agents.id))
      .where(and(...conditions))
      .orderBy(desc(guardianIncidents.createdAt))
      .limit(limit);

    res.json({
      incidents: rows.map((row) => ({
        ...row.incident,
        agentName: row.agentName ?? null,
      })),
    });
  });

  router.post("/guardian/incidents/:id/resolve", async (req, res) => {
    const id = req.params.id as string;
    const existing = await db
      .select()
      .from(guardianIncidents)
      .where(eq(guardianIncidents.id, id))
      .limit(1);
    if (existing.length === 0) throw notFound("Incident not found");
    assertCompanyAccess(req, existing[0].companyId);

    const now = new Date();
    const [updated] = await db
      .update(guardianIncidents)
      .set({ resolved: true, resolvedAt: now, updatedAt: now })
      .where(eq(guardianIncidents.id, id))
      .returning();
    res.json({ incident: updated });
  });

  router.get("/guardian/incidents/summary", async (req, res) => {
    const companyId = typeof req.query.companyId === "string" ? req.query.companyId : null;
    if (!companyId) throw badRequest("companyId query parameter is required");
    assertCompanyAccess(req, companyId);

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const severityRows = await db
      .select({
        severity: guardianIncidents.severity,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(guardianIncidents)
      .where(
        and(
          eq(guardianIncidents.companyId, companyId),
          eq(guardianIncidents.resolved, false),
        ),
      )
      .groupBy(guardianIncidents.severity);

    const typeRows = await db
      .select({
        incidentType: guardianIncidents.incidentType,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(guardianIncidents)
      .where(
        and(
          eq(guardianIncidents.companyId, companyId),
          gte(guardianIncidents.createdAt, since),
        ),
      )
      .groupBy(guardianIncidents.incidentType);

    const watchdogRows = await db
      .select({
        watchdog: guardianIncidents.watchdog,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(guardianIncidents)
      .where(
        and(
          eq(guardianIncidents.companyId, companyId),
          gte(guardianIncidents.createdAt, since),
        ),
      )
      .groupBy(guardianIncidents.watchdog);

    const [resolvedTodayRow] = await db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(guardianIncidents)
      .where(
        and(
          eq(guardianIncidents.companyId, companyId),
          eq(guardianIncidents.resolved, true),
          gte(guardianIncidents.resolvedAt, todayStart),
        ),
      );

    const bySeverity: Record<string, number> = { info: 0, warning: 0, critical: 0 };
    for (const row of severityRows) bySeverity[row.severity] = Number(row.count);
    const byType: Record<string, number> = {};
    for (const row of typeRows) byType[row.incidentType] = Number(row.count);
    const byWatchdog: Record<string, number> = {};
    for (const row of watchdogRows) byWatchdog[row.watchdog] = Number(row.count);

    res.json({
      bySeverity,
      byType,
      byWatchdog,
      resolvedToday: Number(resolvedTodayRow?.count ?? 0),
      totalOpen:
        (bySeverity.info ?? 0) + (bySeverity.warning ?? 0) + (bySeverity.critical ?? 0),
    });
  });

  return router;
}
