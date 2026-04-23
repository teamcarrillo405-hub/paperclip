import type { Db } from "@paperclipai/db";
import {
  auditLog,
  heartbeatRunEvents,
  heartbeatRuns,
  activityLog,
} from "@paperclipai/db";
import { and, eq, lt } from "drizzle-orm";

export interface RetentionPolicy {
  // days — null means forever
  runLogDays: number | null;
  auditLogDays: number | null;
  billingDays: number | null;
  activityDays: number | null;
}

export const DEFAULT_RETENTION: RetentionPolicy = {
  runLogDays: 90,
  auditLogDays: 365,
  billingDays: null,
  activityDays: 365,
};

export interface RetentionResult {
  runEventsDeleted: number;
  runsDeleted: number;
  auditEntriesDeleted: number;
  activityEntriesDeleted: number;
}

function cutoff(days: number | null): Date | null {
  if (days === null) return null;
  if (days < 0) return null;
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

export async function applyRetentionPolicy(
  db: Db,
  companyId: string,
  policy: RetentionPolicy = DEFAULT_RETENTION,
): Promise<RetentionResult> {
  const result: RetentionResult = {
    runEventsDeleted: 0,
    runsDeleted: 0,
    auditEntriesDeleted: 0,
    activityEntriesDeleted: 0,
  };

  const runCutoff = cutoff(policy.runLogDays);
  if (runCutoff) {
    const oldRuns = await db
      .select({ id: heartbeatRuns.id })
      .from(heartbeatRuns)
      .where(and(eq(heartbeatRuns.companyId, companyId), lt(heartbeatRuns.startedAt, runCutoff)));
    for (const run of oldRuns) {
      const delEvents = await db
        .delete(heartbeatRunEvents)
        .where(eq(heartbeatRunEvents.runId, run.id))
        .returning({ id: heartbeatRunEvents.id });
      result.runEventsDeleted += delEvents.length;
    }
  }

  const auditCutoff = cutoff(policy.auditLogDays);
  if (auditCutoff) {
    const deleted = await db
      .delete(auditLog)
      .where(and(eq(auditLog.companyId, companyId), lt(auditLog.timestamp, auditCutoff)))
      .returning({ id: auditLog.id });
    result.auditEntriesDeleted = deleted.length;
  }

  const activityCutoff = cutoff(policy.activityDays);
  if (activityCutoff) {
    const deleted = await db
      .delete(activityLog)
      .where(
        and(eq(activityLog.companyId, companyId), lt(activityLog.createdAt, activityCutoff)),
      )
      .returning({ id: activityLog.id });
    result.activityEntriesDeleted = deleted.length;
  }

  return result;
}

export interface DataSummary {
  auditEntries: number;
  activityEntries: number;
  runs: number;
}

export async function getCompanyDataSummary(db: Db, companyId: string): Promise<DataSummary> {
  const auditEntries = await db
    .select({ id: auditLog.id })
    .from(auditLog)
    .where(eq(auditLog.companyId, companyId));
  const activityEntries = await db
    .select({ id: activityLog.id })
    .from(activityLog)
    .where(eq(activityLog.companyId, companyId));
  const runs = await db
    .select({ id: heartbeatRuns.id })
    .from(heartbeatRuns)
    .where(eq(heartbeatRuns.companyId, companyId));
  return {
    auditEntries: auditEntries.length,
    activityEntries: activityEntries.length,
    runs: runs.length,
  };
}

// GDPR-style hard delete — wipes audit + activity + run events for a company.
// Does NOT delete billing data or company record itself; caller should coordinate.
export async function deleteCompanyUserData(db: Db, companyId: string): Promise<RetentionResult> {
  return applyRetentionPolicy(db, companyId, {
    runLogDays: 0,
    auditLogDays: 0,
    billingDays: null,
    activityDays: 0,
  });
}
