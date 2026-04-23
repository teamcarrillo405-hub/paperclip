import { and, eq, gte, lte, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  billingSubscriptions,
  financeEvents,
  guardianIncidents,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import { BILLING_PLANS, isBillingPlanId } from "./billing-plans.js";

export type RoiPeriod = "7d" | "30d" | "90d";

export interface RoiMetrics {
  tasksAutomatedTotal: number;
  tasksAutomatedThisMonth: number;
  tasksAutomatedThisPeriod: number;
  estimatedHoursSaved: number;
  estimatedDollarsSaved: number;
  invoicesSentByAgent: number;
  arAmountRecovered: number;
  agentUptimePercent: number;
  runsCompletedThisWeek: number;
  incidentsResolvedByGuardian: number;
  monthlyPlanCost: number;
  roiMultiple: number;
  period: RoiPeriod;
  disclaimer: string;
}

export interface RoiTimelinePoint {
  date: string;
  tasksCompleted: number;
  estimatedDollarsSaved: number;
}

export interface RoiTimeline {
  period: RoiPeriod;
  points: RoiTimelinePoint[];
}

const HOURS_PER_TASK = 0.25;
const DOLLARS_PER_HOUR = 35;
const DISCLAIMER = "Estimates based on industry averages ($35/hr SMB labor)";

function periodDays(period: RoiPeriod): number {
  if (period === "7d") return 7;
  if (period === "90d") return 90;
  return 30;
}

function startOfPeriod(now: Date, period: RoiPeriod): Date {
  const days = periodDays(period);
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function startOfMonth(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfWeek(now: Date): Date {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}

function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function enumerateDateKeys(from: Date, to: Date): string[] {
  const keys: string[] = [];
  const startUtc = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const endUtc = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  for (let ts = startUtc; ts <= endUtc; ts += 24 * 60 * 60 * 1000) {
    keys.push(formatUtcDateKey(new Date(ts)));
  }
  return keys;
}

export function roiMetricsService(db: Db) {
  async function loadMonthlyPlanCost(companyId: string): Promise<number> {
    const row = await db
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.companyId, companyId))
      .then((rows) => rows[0] ?? null);
    if (!row || !isBillingPlanId(row.planId)) return 0;
    return BILLING_PLANS[row.planId].price;
  }

  async function getRoiMetrics(companyId: string, period: RoiPeriod): Promise<RoiMetrics> {
    const now = new Date();
    const periodStart = startOfPeriod(now, period);
    const monthStart = startOfMonth(now);
    const weekStart = startOfWeek(now);

    const [
      totalTasksRow,
      periodTasksRow,
      monthTasksRow,
      invoiceRow,
      arRecoveredRow,
      runsWeekRow,
      runsStatusRow,
      incidentsResolvedRow,
    ] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            sql`${issues.assigneeAgentId} is not null`,
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            sql`${issues.assigneeAgentId} is not null`,
            gte(issues.completedAt, periodStart),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(
          and(
            eq(issues.companyId, companyId),
            eq(issues.status, "done"),
            sql`${issues.assigneeAgentId} is not null`,
            gte(issues.completedAt, monthStart),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(financeEvents)
        .where(
          and(
            eq(financeEvents.companyId, companyId),
            eq(financeEvents.eventKind, "invoice_sent"),
            sql`${financeEvents.agentId} is not null`,
            gte(financeEvents.occurredAt, periodStart),
          ),
        ),
      db
        .select({
          amount: sql<number>`coalesce(sum(${financeEvents.amountCents}), 0)::double precision`,
        })
        .from(financeEvents)
        .where(
          and(
            eq(financeEvents.companyId, companyId),
            eq(financeEvents.direction, "credit"),
            eq(financeEvents.eventKind, "payment_received"),
            gte(financeEvents.occurredAt, periodStart),
          ),
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            eq(heartbeatRuns.status, "succeeded"),
            gte(heartbeatRuns.finishedAt, weekStart),
          ),
        ),
      db
        .select({
          status: heartbeatRuns.status,
          count: sql<number>`count(*)::int`,
        })
        .from(heartbeatRuns)
        .where(
          and(
            eq(heartbeatRuns.companyId, companyId),
            gte(heartbeatRuns.createdAt, periodStart),
          ),
        )
        .groupBy(heartbeatRuns.status),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(guardianIncidents)
        .where(
          and(
            eq(guardianIncidents.companyId, companyId),
            eq(guardianIncidents.resolved, true),
            gte(guardianIncidents.createdAt, periodStart),
          ),
        ),
    ]);

    const tasksAutomatedTotal = Number(totalTasksRow[0]?.count ?? 0);
    const tasksAutomatedThisPeriod = Number(periodTasksRow[0]?.count ?? 0);
    const tasksAutomatedThisMonth = Number(monthTasksRow[0]?.count ?? 0);
    const invoicesSentByAgent = Number(invoiceRow[0]?.count ?? 0);
    const arAmountRecoveredCents = Number(arRecoveredRow[0]?.amount ?? 0);
    const arAmountRecovered = arAmountRecoveredCents / 100;
    const runsCompletedThisWeek = Number(runsWeekRow[0]?.count ?? 0);
    const incidentsResolvedByGuardian = Number(incidentsResolvedRow[0]?.count ?? 0);

    let totalRuns = 0;
    let succeededRuns = 0;
    for (const row of runsStatusRow) {
      const count = Number(row.count);
      totalRuns += count;
      if (row.status === "succeeded") succeededRuns += count;
    }
    const agentUptimePercent =
      totalRuns > 0 ? Number(((succeededRuns / totalRuns) * 100).toFixed(1)) : 100;

    const estimatedHoursSaved = Number(
      (tasksAutomatedThisPeriod * HOURS_PER_TASK).toFixed(1),
    );
    const estimatedDollarsSaved = Number(
      (estimatedHoursSaved * DOLLARS_PER_HOUR).toFixed(2),
    );

    const monthlyPlanCost = await loadMonthlyPlanCost(companyId);
    const monthlyHoursSaved = tasksAutomatedThisMonth * HOURS_PER_TASK;
    const monthlyDollarsSaved = monthlyHoursSaved * DOLLARS_PER_HOUR;
    const roiMultiple =
      monthlyPlanCost > 0
        ? Number((monthlyDollarsSaved / monthlyPlanCost).toFixed(2))
        : 0;

    return {
      tasksAutomatedTotal,
      tasksAutomatedThisMonth,
      tasksAutomatedThisPeriod,
      estimatedHoursSaved,
      estimatedDollarsSaved,
      invoicesSentByAgent,
      arAmountRecovered,
      agentUptimePercent,
      runsCompletedThisWeek,
      incidentsResolvedByGuardian,
      monthlyPlanCost,
      roiMultiple,
      period,
      disclaimer: DISCLAIMER,
    };
  }

  async function getRoiTimeline(companyId: string, period: RoiPeriod): Promise<RoiTimeline> {
    const now = new Date();
    const periodStart = startOfPeriod(now, period);
    const dayExpr = sql<string>`to_char(${issues.completedAt} at time zone 'UTC', 'YYYY-MM-DD')`;

    const rows = await db
      .select({
        date: dayExpr,
        count: sql<number>`count(*)::int`,
      })
      .from(issues)
      .where(
        and(
          eq(issues.companyId, companyId),
          eq(issues.status, "done"),
          sql`${issues.assigneeAgentId} is not null`,
          gte(issues.completedAt, periodStart),
          lte(issues.completedAt, now),
        ),
      )
      .groupBy(dayExpr);

    const dateKeys = enumerateDateKeys(periodStart, now);
    const countsByDate = new Map<string, number>();
    for (const row of rows) {
      countsByDate.set(row.date, Number(row.count));
    }

    const points: RoiTimelinePoint[] = dateKeys.map((date) => {
      const tasksCompleted = countsByDate.get(date) ?? 0;
      const estimatedDollarsSaved = Number(
        (tasksCompleted * HOURS_PER_TASK * DOLLARS_PER_HOUR).toFixed(2),
      );
      return { date, tasksCompleted, estimatedDollarsSaved };
    });

    return { period, points };
  }

  return {
    getRoiMetrics,
    getRoiTimeline,
  };
}
