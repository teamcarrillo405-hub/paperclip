// Register in server/src/app.ts:
// import { enterpriseAdminRoutes } from "./routes/enterprise-admin.js";
// api.use(enterpriseAdminRoutes(db));

import fs from "node:fs/promises";
import path from "node:path";
import { Router } from "express";
import { and, count, desc, eq, gte, ilike, lte, sql, sum } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  auditLog,
  companies,
  companyMemberships,
  costEvents,
  issues,
} from "@paperclipai/db";
import { assertInstanceAdmin } from "./authz.js";
import { badRequest, notFound } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelPolicies = {
  allowedModels: string[];
  maxBudgetPerAgentMonthly: number;
  restrictedCompanies: Array<{ companyId: string; allowedModels: string[] }>;
  requireApprovalAbove: number;
};

const DEFAULT_MODEL_POLICIES: ModelPolicies = {
  allowedModels: [],
  maxBudgetPerAgentMonthly: 0,
  requireApprovalAbove: 0,
  restrictedCompanies: [],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function modelPoliciesPath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "model-policies.json");
}

async function readModelPolicies(): Promise<ModelPolicies> {
  try {
    const raw = await fs.readFile(modelPoliciesPath(), "utf-8");
    return { ...DEFAULT_MODEL_POLICIES, ...JSON.parse(raw) } as ModelPolicies;
  } catch {
    return DEFAULT_MODEL_POLICIES;
  }
}

async function writeModelPolicies(policies: ModelPolicies): Promise<void> {
  const filePath = modelPoliciesPath();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(policies, null, 2), "utf-8");
}

function parsePeriodDays(raw: unknown): number {
  if (raw === "7d") return 7;
  if (raw === "90d") return 90;
  return 30;
}

function periodStart(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parsePage(raw: unknown): number {
  const n = parseInt(String(raw ?? "1"), 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function parseLimit(raw: unknown, defaultLimit = 50): number {
  const n = parseInt(String(raw ?? String(defaultLimit)), 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, 200) : defaultLimit;
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function enterpriseAdminRoutes(db: Db) {
  const router = Router();

  // -------------------------------------------------------------------------
  // Users management
  // -------------------------------------------------------------------------

  // GET /admin/users — list all users across all companies
  router.get("/admin/users", async (req, res) => {
    assertInstanceAdmin(req);

    const search = req.query.search as string | undefined;
    const companyId = req.query.companyId as string | undefined;
    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const offset = (page - 1) * limit;

    // Build base query joining with memberships
    const memberships = await db
      .select({
        principalId: companyMemberships.principalId,
        companyId: companyMemberships.companyId,
        membershipRole: companyMemberships.membershipRole,
        status: companyMemberships.status,
        companyName: companies.name,
      })
      .from(companyMemberships)
      .innerJoin(companies, eq(companyMemberships.companyId, companies.id))
      .where(eq(companyMemberships.principalType, "user"));

    // Group memberships by user
    const membershipMap = new Map<string, typeof memberships>();
    for (const m of memberships) {
      if (!membershipMap.has(m.principalId)) membershipMap.set(m.principalId, []);
      membershipMap.get(m.principalId)!.push(m);
    }

    // Query users from instance_user_roles table (which is the auth users table in this system)
    // Since we use Drizzle but user records live in auth/session tables, we derive users from memberships
    const userIds = [...membershipMap.keys()];

    // Filter by companyId if provided
    const filteredUserIds = companyId
      ? userIds.filter((uid) => membershipMap.get(uid)?.some((m) => m.companyId === companyId))
      : userIds;

    // Apply search filter on userId (we don't have a users table in schema, search by id prefix)
    const searchFiltered = search
      ? filteredUserIds.filter((uid) => uid.toLowerCase().includes(search.toLowerCase()))
      : filteredUserIds;

    const total = searchFiltered.length;
    const pageUserIds = searchFiltered.slice(offset, offset + limit);

    const users = pageUserIds.map((uid) => {
      const userMemberships = membershipMap.get(uid) ?? [];
      return {
        id: uid,
        email: null as string | null,
        name: null as string | null,
        createdAt: null as string | null,
        companies: userMemberships.map((m) => ({
          companyId: m.companyId,
          companyName: m.companyName,
          membershipRole: m.membershipRole,
          status: m.status,
        })),
      };
    });

    res.json({ users, total, page });
  });

  // GET /admin/users/:id — single user with all memberships
  router.get("/admin/users/:id", async (req, res) => {
    assertInstanceAdmin(req);

    const userId = req.params.id as string;

    const userMemberships = await db
      .select({
        companyId: companyMemberships.companyId,
        membershipRole: companyMemberships.membershipRole,
        status: companyMemberships.status,
        createdAt: companyMemberships.createdAt,
        updatedAt: companyMemberships.updatedAt,
        companyName: companies.name,
        companyStatus: companies.status,
      })
      .from(companyMemberships)
      .innerJoin(companies, eq(companyMemberships.companyId, companies.id))
      .where(
        and(
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, userId),
        ),
      );

    if (userMemberships.length === 0) {
      throw notFound("User not found");
    }

    // Get recent activity from audit_log
    const recentActivity = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userId))
      .orderBy(desc(auditLog.timestamp))
      .limit(20);

    res.json({
      id: userId,
      email: null,
      name: null,
      memberships: userMemberships,
      recentActivity,
    });
  });

  // PATCH /admin/users/:id — update user: { active?, role? }
  router.patch("/admin/users/:id", async (req, res) => {
    assertInstanceAdmin(req);

    const userId = req.params.id as string;
    const { active, role } = req.body as { active?: boolean; role?: string };

    // If deactivating, update all memberships to suspended
    if (active === false) {
      await db
        .update(companyMemberships)
        .set({ status: "suspended", updatedAt: new Date() })
        .where(
          and(
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
          ),
        );
    }

    // If re-activating, restore active memberships
    if (active === true) {
      await db
        .update(companyMemberships)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
            eq(companyMemberships.status, "suspended"),
          ),
        );
    }

    // Role updates apply to all memberships if provided
    if (role) {
      await db
        .update(companyMemberships)
        .set({ membershipRole: role, updatedAt: new Date() })
        .where(
          and(
            eq(companyMemberships.principalType, "user"),
            eq(companyMemberships.principalId, userId),
          ),
        );
    }

    res.json({ success: true, userId });
  });

  // DELETE /admin/users/:id — deactivate user
  router.delete("/admin/users/:id", async (req, res) => {
    assertInstanceAdmin(req);

    const userId = req.params.id as string;

    await db
      .update(companyMemberships)
      .set({ status: "suspended", updatedAt: new Date() })
      .where(
        and(
          eq(companyMemberships.principalType, "user"),
          eq(companyMemberships.principalId, userId),
        ),
      );

    res.json({ success: true, userId });
  });

  // -------------------------------------------------------------------------
  // Usage analytics
  // -------------------------------------------------------------------------

  // GET /admin/usage — AI cost breakdown by period and groupBy dimension
  router.get("/admin/usage", async (req, res) => {
    assertInstanceAdmin(req);

    const days = parsePeriodDays(req.query.period);
    const groupBy = (req.query.groupBy as string) || "company";
    const since = periodStart(days);

    if (groupBy === "company") {
      const rows = await db
        .select({
          id: costEvents.companyId,
          name: companies.name,
          totalCents: sum(costEvents.costCents),
          eventCount: count(costEvents.id),
        })
        .from(costEvents)
        .innerJoin(companies, eq(costEvents.companyId, companies.id))
        .where(gte(costEvents.occurredAt, since))
        .groupBy(costEvents.companyId, companies.name)
        .orderBy(desc(sum(costEvents.costCents)));

      res.json({
        groupBy,
        period: req.query.period || "30d",
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          totalCents: Number(r.totalCents ?? 0),
          eventCount: Number(r.eventCount ?? 0),
        })),
      });
    } else if (groupBy === "agent") {
      const rows = await db
        .select({
          id: costEvents.agentId,
          name: agents.name,
          companyName: companies.name,
          totalCents: sum(costEvents.costCents),
          eventCount: count(costEvents.id),
        })
        .from(costEvents)
        .innerJoin(agents, eq(costEvents.agentId, agents.id))
        .innerJoin(companies, eq(costEvents.companyId, companies.id))
        .where(gte(costEvents.occurredAt, since))
        .groupBy(costEvents.agentId, agents.name, companies.name)
        .orderBy(desc(sum(costEvents.costCents)));

      res.json({
        groupBy,
        period: req.query.period || "30d",
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          companyName: r.companyName,
          totalCents: Number(r.totalCents ?? 0),
          eventCount: Number(r.eventCount ?? 0),
        })),
      });
    } else {
      // groupBy === "user" — group by model/provider as proxy since cost_events don't have user directly
      const rows = await db
        .select({
          id: costEvents.model,
          name: costEvents.model,
          provider: costEvents.provider,
          totalCents: sum(costEvents.costCents),
          eventCount: count(costEvents.id),
        })
        .from(costEvents)
        .where(gte(costEvents.occurredAt, since))
        .groupBy(costEvents.model, costEvents.provider)
        .orderBy(desc(sum(costEvents.costCents)));

      res.json({
        groupBy,
        period: req.query.period || "30d",
        rows: rows.map((r) => ({
          id: r.id,
          name: r.name,
          provider: r.provider,
          totalCents: Number(r.totalCents ?? 0),
          eventCount: Number(r.eventCount ?? 0),
        })),
      });
    }
  });

  // GET /admin/usage/top-agents — top 10 agents by spend this month
  router.get("/admin/usage/top-agents", async (req, res) => {
    assertInstanceAdmin(req);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        agentId: costEvents.agentId,
        agentName: agents.name,
        companyName: companies.name,
        totalCents: sum(costEvents.costCents),
      })
      .from(costEvents)
      .innerJoin(agents, eq(costEvents.agentId, agents.id))
      .innerJoin(companies, eq(costEvents.companyId, companies.id))
      .where(gte(costEvents.occurredAt, monthStart))
      .groupBy(costEvents.agentId, agents.name, companies.name)
      .orderBy(desc(sum(costEvents.costCents)))
      .limit(10);

    res.json(
      rows.map((r) => ({
        agentId: r.agentId,
        agentName: r.agentName,
        companyName: r.companyName,
        totalCents: Number(r.totalCents ?? 0),
      })),
    );
  });

  // GET /admin/usage/top-companies — top 10 companies by spend this month
  router.get("/admin/usage/top-companies", async (req, res) => {
    assertInstanceAdmin(req);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const rows = await db
      .select({
        companyId: costEvents.companyId,
        companyName: companies.name,
        totalCents: sum(costEvents.costCents),
      })
      .from(costEvents)
      .innerJoin(companies, eq(costEvents.companyId, companies.id))
      .where(gte(costEvents.occurredAt, monthStart))
      .groupBy(costEvents.companyId, companies.name)
      .orderBy(desc(sum(costEvents.costCents)))
      .limit(10);

    res.json(
      rows.map((r) => ({
        companyId: r.companyId,
        companyName: r.companyName,
        totalCents: Number(r.totalCents ?? 0),
      })),
    );
  });

  // -------------------------------------------------------------------------
  // Model access policies
  // -------------------------------------------------------------------------

  // GET /admin/model-policies
  router.get("/admin/model-policies", async (req, res) => {
    assertInstanceAdmin(req);
    const policies = await readModelPolicies();
    res.json(policies);
  });

  // PUT /admin/model-policies
  router.put("/admin/model-policies", async (req, res) => {
    assertInstanceAdmin(req);

    const body = req.body as Partial<ModelPolicies>;

    if (body.allowedModels !== undefined && !Array.isArray(body.allowedModels)) {
      throw badRequest("allowedModels must be an array");
    }
    if (
      body.maxBudgetPerAgentMonthly !== undefined &&
      typeof body.maxBudgetPerAgentMonthly !== "number"
    ) {
      throw badRequest("maxBudgetPerAgentMonthly must be a number");
    }
    if (
      body.requireApprovalAbove !== undefined &&
      typeof body.requireApprovalAbove !== "number"
    ) {
      throw badRequest("requireApprovalAbove must be a number");
    }

    const existing = await readModelPolicies();
    const updated: ModelPolicies = {
      ...existing,
      ...body,
    };

    await writeModelPolicies(updated);
    res.json(updated);
  });

  // -------------------------------------------------------------------------
  // Audit log
  // -------------------------------------------------------------------------

  // GET /admin/audit-log
  router.get("/admin/audit-log", async (req, res) => {
    assertInstanceAdmin(req);

    const page = parsePage(req.query.page);
    const limit = parseLimit(req.query.limit);
    const offset = (page - 1) * limit;

    const userId = req.query.userId as string | undefined;
    const companyId = req.query.companyId as string | undefined;
    const action = req.query.action as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    const conditions = [];
    if (userId) conditions.push(eq(auditLog.userId, userId));
    if (companyId) conditions.push(eq(auditLog.companyId, companyId));
    if (action) conditions.push(ilike(auditLog.action, `%${action}%`));
    if (from) conditions.push(gte(auditLog.timestamp, new Date(from)));
    if (to) conditions.push(lte(auditLog.timestamp, new Date(to)));

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [rows, totalRows] = await Promise.all([
      db
        .select()
        .from(auditLog)
        .where(whereClause)
        .orderBy(desc(auditLog.timestamp))
        .limit(limit)
        .offset(offset),
      db
        .select({ total: count(auditLog.id) })
        .from(auditLog)
        .where(whereClause)
        .then((r) => Number(r[0]?.total ?? 0)),
    ]);

    res.json({ rows, total: totalRows, page, limit });
  });

  // -------------------------------------------------------------------------
  // System info
  // -------------------------------------------------------------------------

  // GET /admin/system
  router.get("/admin/system", async (req, res) => {
    assertInstanceAdmin(req);

    const mem = process.memoryUsage();

    const [totalUsersRow, totalCompaniesRow, totalAgentsRow, totalIssuesRow, totalCostEventsRow] =
      await Promise.all([
        db
          .select({ total: count(companyMemberships.id) })
          .from(companyMemberships)
          .where(eq(companyMemberships.principalType, "user"))
          .then((r) => Number(r[0]?.total ?? 0)),
        db
          .select({ total: count(companies.id) })
          .from(companies)
          .then((r) => Number(r[0]?.total ?? 0)),
        db
          .select({ total: count(agents.id) })
          .from(agents)
          .then((r) => Number(r[0]?.total ?? 0)),
        db
          .select({ total: count(issues.id) })
          .from(issues)
          .then((r) => Number(r[0]?.total ?? 0)),
        db
          .select({ total: count(costEvents.id) })
          .from(costEvents)
          .then((r) => Number(r[0]?.total ?? 0)),
      ]);

    // Get postgres version
    let dbVersion = "unknown";
    try {
      const versionRow = await db.execute(sql`SELECT version()`);
      const rows = versionRow as unknown as Array<{ version: string }>;
      if (rows[0]?.version) {
        const match = rows[0].version.match(/PostgreSQL ([0-9.]+)/);
        dbVersion = match ? match[1] : rows[0].version;
      }
    } catch {
      // ignore
    }

    const uptimeSecs = process.uptime();
    const days = Math.floor(uptimeSecs / 86400);
    const hours = Math.floor((uptimeSecs % 86400) / 3600);
    const minutes = Math.floor((uptimeSecs % 3600) / 60);

    res.json({
      nodeVersion: process.version,
      uptime: uptimeSecs,
      uptimeFormatted: `${days}d ${hours}h ${minutes}m`,
      memoryUsage: {
        rss: mem.rss,
        heapUsed: mem.heapUsed,
        heapTotal: mem.heapTotal,
        external: mem.external,
      },
      dbVersion,
      totalUsers: totalUsersRow,
      totalCompanies: totalCompaniesRow,
      totalAgents: totalAgentsRow,
      totalIssues: totalIssuesRow,
      totalCostEvents: totalCostEventsRow,
      env: process.env.NODE_ENV ?? "development",
    });
  });

  return router;
}
