// Register in server/src/app.ts:
// import { reportsRoutes } from "./routes/reports.js";
// api.use(reportsRoutes(db));

import { Router } from "express";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, companies, costEvents, issues } from "@paperclipai/db";
import { assertInstanceAdmin } from "./authz.js";
import { badRequest } from "../errors.js";
import { roiMetricsService } from "../services/roi-metrics.js";

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

type ReportPeriod = "30d" | "90d" | "12m";

function parsePeriod(raw: unknown): ReportPeriod {
  if (raw === "30d" || raw === "90d" || raw === "12m") return raw;
  if (raw == null || raw === "") return "30d";
  throw badRequest("Invalid period. Must be one of: 30d, 90d, 12m");
}

function periodStart(period: ReportPeriod): Date {
  const now = new Date();
  if (period === "30d") return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (period === "90d") return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  // 12m — approximately 365 days
  return new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
}

function periodDays(period: ReportPeriod): number {
  if (period === "30d") return 30;
  if (period === "90d") return 90;
  return 365;
}

function enumerateDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const startUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const endUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  for (let ts = startUtc; ts <= endUtc; ts += 24 * 60 * 60 * 1000) {
    keys.push(new Date(ts).toISOString().slice(0, 10));
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Cost helpers
// ---------------------------------------------------------------------------

const HOURS_PER_TASK = 0.25;
const DOLLARS_PER_HOUR = 35;

function centsToUsd(cents: number): number {
  return Number((cents / 100).toFixed(2));
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function reportsRoutes(db: Db) {
  const router = Router();
  const roiSvc = roiMetricsService(db);

  // -------------------------------------------------------------------------
  // GET /reports/overview
  // -------------------------------------------------------------------------
  router.get("/reports/overview", async (req, res) => {
    assertInstanceAdmin(req);
    const period = parsePeriod(req.query.period);
    const from = periodStart(period);
    const now = new Date();

    const [issueCountRows, resolvedCountRow, activeAgentRow, companiesCountRow, costRow] =
      await Promise.all([
        // Total issues created in period
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(issues)
          .where(gte(issues.createdAt, from)),

        // Resolved issues (status = "done") updated in period
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(issues)
          .where(and(eq(issues.status, "done"), gte(issues.completedAt, from))),

        // Active agents (status = "idle" or "running" — operational agents)
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(agents)
          .where(sql`${agents.status} in ('idle', 'running', 'active')`),

        // Total companies
        db.select({ count: sql<number>`count(*)::int` }).from(companies),

        // Total cost in period
        db
          .select({
            totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`,
          })
          .from(costEvents)
          .where(and(gte(costEvents.occurredAt, from), sql`${costEvents.occurredAt} <= ${now}`)),
      ]);

    const totalIssues = Number(issueCountRows[0]?.count ?? 0);
    const resolvedIssues = Number(resolvedCountRow[0]?.count ?? 0);
    const resolutionRate =
      totalIssues > 0 ? Number(((resolvedIssues / totalIssues) * 100).toFixed(1)) : 0;
    const activeAgents = Number(activeAgentRow[0]?.count ?? 0);
    const totalCompanies = Number(companiesCountRow[0]?.count ?? 0);
    const totalCostUsd = centsToUsd(Number(costRow[0]?.totalCents ?? 0));

    // Estimated ROI: resolved tasks * HOURS_PER_TASK * DOLLARS_PER_HOUR
    const estimatedRoiUsd = Number(
      (resolvedIssues * HOURS_PER_TASK * DOLLARS_PER_HOUR).toFixed(2),
    );

    // Avg resolution hours: approximate using period days / resolved issues
    // (a rough proxy; precise calc would require start/completedAt diff per issue)
    const days = periodDays(period);
    const avgResolutionHours =
      resolvedIssues > 0
        ? Number(((days * 24) / resolvedIssues).toFixed(1))
        : 0;

    res.json({
      period,
      totalIssues,
      resolvedIssues,
      resolutionRate,
      activeAgents,
      totalCompanies,
      totalCostUsd,
      estimatedRoiUsd,
      avgResolutionHours,
    });
  });

  // -------------------------------------------------------------------------
  // GET /reports/issues-by-day
  // -------------------------------------------------------------------------
  router.get("/reports/issues-by-day", async (req, res) => {
    assertInstanceAdmin(req);
    const period = parsePeriod(req.query.period);
    const from = periodStart(period);
    const now = new Date();

    const createdDayExpr = sql<string>`to_char(${issues.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`;
    const resolvedDayExpr = sql<string>`to_char(${issues.completedAt} at time zone 'UTC', 'YYYY-MM-DD')`;

    const [createdRows, resolvedRows] = await Promise.all([
      db
        .select({
          date: createdDayExpr,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(and(gte(issues.createdAt, from), sql`${issues.createdAt} <= ${now}`))
        .groupBy(createdDayExpr),

      db
        .select({
          date: resolvedDayExpr,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(
          and(
            eq(issues.status, "done"),
            gte(issues.completedAt, from),
            sql`${issues.completedAt} <= ${now}`,
          ),
        )
        .groupBy(resolvedDayExpr),
    ]);

    const createdByDate = new Map<string, number>();
    for (const row of createdRows) createdByDate.set(row.date, Number(row.count));

    const resolvedByDate = new Map<string, number>();
    for (const row of resolvedRows) resolvedByDate.set(row.date, Number(row.count));

    const dateKeys = enumerateDateKeys(from, now);
    const result = dateKeys.map((date) => ({
      date,
      created: createdByDate.get(date) ?? 0,
      resolved: resolvedByDate.get(date) ?? 0,
    }));

    res.json(result);
  });

  // -------------------------------------------------------------------------
  // GET /reports/cost-by-agent
  // -------------------------------------------------------------------------
  router.get("/reports/cost-by-agent", async (req, res) => {
    assertInstanceAdmin(req);
    const period = parsePeriod(req.query.period);
    const from = periodStart(period);
    const companyId = req.query.companyId as string | undefined;

    const conditions = [
      gte(costEvents.occurredAt, from),
      ...(companyId ? [eq(costEvents.companyId, companyId)] : []),
    ];

    const rows = await db
      .select({
        agentId: costEvents.agentId,
        agentName: agents.name,
        totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`,
        issueCount: sql<number>`count(distinct ${costEvents.heartbeatRunId})::int`,
      })
      .from(costEvents)
      .leftJoin(agents, eq(costEvents.agentId, agents.id))
      .where(and(...conditions))
      .groupBy(costEvents.agentId, agents.name)
      .orderBy(desc(sql<number>`coalesce(sum(${costEvents.costCents}), 0)`))
      .limit(10);

    const result = rows.map((row) => ({
      agentId: row.agentId,
      agentName: row.agentName ?? "Unknown Agent",
      totalCostUsd: centsToUsd(Number(row.totalCostCents)),
      issueCount: Number(row.issueCount),
    }));

    res.json(result);
  });

  // -------------------------------------------------------------------------
  // GET /reports/cost-by-company
  // -------------------------------------------------------------------------
  router.get("/reports/cost-by-company", async (req, res) => {
    assertInstanceAdmin(req);
    const period = parsePeriod(req.query.period);
    const from = periodStart(period);

    const rows = await db
      .select({
        companyId: costEvents.companyId,
        companyName: companies.name,
        totalCostCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)::double precision`,
        issueCount: sql<number>`count(distinct ${costEvents.heartbeatRunId})::int`,
      })
      .from(costEvents)
      .leftJoin(companies, eq(costEvents.companyId, companies.id))
      .where(gte(costEvents.occurredAt, from))
      .groupBy(costEvents.companyId, companies.name)
      .orderBy(desc(sql<number>`coalesce(sum(${costEvents.costCents}), 0)`));

    const result = rows.map((row) => ({
      companyId: row.companyId,
      companyName: row.companyName ?? "Unknown Company",
      totalCostUsd: centsToUsd(Number(row.totalCostCents)),
      issueCount: Number(row.issueCount),
    }));

    res.json(result);
  });

  // -------------------------------------------------------------------------
  // GET /reports/resolution-rate-by-agent
  // -------------------------------------------------------------------------
  router.get("/reports/resolution-rate-by-agent", async (req, res) => {
    assertInstanceAdmin(req);
    const period = parsePeriod(req.query.period);
    const from = periodStart(period);
    const companyId = req.query.companyId as string | undefined;

    const conditions = [
      gte(issues.createdAt, from),
      sql`${issues.assigneeAgentId} is not null`,
      ...(companyId ? [eq(issues.companyId, companyId)] : []),
    ];

    const rows = await db
      .select({
        agentId: issues.assigneeAgentId,
        agentName: agents.name,
        total: sql<number>`count(*)::int`,
        resolved: sql<number>`count(case when ${issues.status} = 'done' then 1 end)::int`,
      })
      .from(issues)
      .leftJoin(agents, eq(issues.assigneeAgentId, agents.id))
      .where(and(...conditions))
      .groupBy(issues.assigneeAgentId, agents.name)
      .orderBy(desc(sql<number>`count(*)::int`));

    const result = rows.map((row) => {
      const total = Number(row.total);
      const resolved = Number(row.resolved);
      const rate = total > 0 ? Number(((resolved / total) * 100).toFixed(1)) : 0;
      return {
        agentId: row.agentId ?? "",
        agentName: row.agentName ?? "Unknown Agent",
        total,
        resolved,
        rate,
      };
    });

    res.json(result);
  });

  // -------------------------------------------------------------------------
  // GET /reports/roi-summary
  // -------------------------------------------------------------------------
  router.get("/reports/roi-summary", async (req, res) => {
    assertInstanceAdmin(req);
    const companyId = req.query.companyId as string | undefined;

    if (!companyId) {
      throw badRequest("companyId is required for ROI summary");
    }

    // Reuse the existing roi-metrics service
    const metrics = await roiSvc.getRoiMetrics(companyId, "30d");
    res.json(metrics);
  });

  return router;
}
