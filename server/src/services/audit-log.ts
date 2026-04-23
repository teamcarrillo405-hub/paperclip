import type { Db } from "@paperclipai/db";
import { auditLog } from "@paperclipai/db";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { detectAndMaskPii } from "../middleware/pii-detector.js";

export type AuditOutcome = "success" | "failure" | "blocked";
export type AuditRiskLevel = "low" | "medium" | "high" | "critical";

export interface AuditEntry {
  id: string;
  companyId: string;
  userId?: string | null;
  agentId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details: Record<string, unknown> | null;
  ipAddress?: string | null;
  outcome: AuditOutcome;
  riskLevel: AuditRiskLevel;
  piiDetected: boolean;
  timestamp: string;
}

export interface LogAuditEntryInput {
  companyId: string;
  userId?: string | null;
  agentId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  outcome?: AuditOutcome;
  riskLevel?: AuditRiskLevel;
}

export interface AuditLogFilters {
  agentId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  outcome?: AuditOutcome;
  riskLevel?: AuditRiskLevel;
  piiDetected?: boolean;
  from?: Date;
  to?: Date;
  limit?: number;
}

function rowToEntry(row: typeof auditLog.$inferSelect): AuditEntry {
  return {
    id: row.id,
    companyId: row.companyId,
    userId: row.userId ?? null,
    agentId: row.agentId ?? null,
    action: row.action,
    resource: row.resource,
    resourceId: row.resourceId ?? null,
    details: (row.details as Record<string, unknown> | null) ?? null,
    ipAddress: row.ipAddress ?? null,
    outcome: row.outcome as AuditOutcome,
    riskLevel: row.riskLevel as AuditRiskLevel,
    piiDetected: row.piiDetected,
    timestamp:
      row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
  };
}

// Append-only — audit entries are never updated or deleted except by retention.
export async function logAuditEntry(db: Db, input: LogAuditEntryInput): Promise<AuditEntry> {
  const detailsInput = input.details ?? null;
  const { value: maskedDetails, piiDetected } = detailsInput
    ? detectAndMaskPii(detailsInput)
    : { value: null as Record<string, unknown> | null, piiDetected: false };

  const [row] = await db
    .insert(auditLog)
    .values({
      companyId: input.companyId,
      userId: input.userId ?? null,
      agentId: input.agentId ?? null,
      action: input.action,
      resource: input.resource,
      resourceId: input.resourceId ?? null,
      details: maskedDetails,
      ipAddress: input.ipAddress ?? null,
      outcome: input.outcome ?? "success",
      riskLevel: input.riskLevel ?? "low",
      piiDetected,
    })
    .returning();

  return rowToEntry(row);
}

export async function getAuditLog(
  db: Db,
  companyId: string,
  filters: AuditLogFilters = {},
): Promise<AuditEntry[]> {
  const conds = [eq(auditLog.companyId, companyId)];
  if (filters.agentId) conds.push(eq(auditLog.agentId, filters.agentId));
  if (filters.userId) conds.push(eq(auditLog.userId, filters.userId));
  if (filters.action) conds.push(eq(auditLog.action, filters.action));
  if (filters.resource) conds.push(eq(auditLog.resource, filters.resource));
  if (filters.outcome) conds.push(eq(auditLog.outcome, filters.outcome));
  if (filters.riskLevel) conds.push(eq(auditLog.riskLevel, filters.riskLevel));
  if (typeof filters.piiDetected === "boolean") {
    conds.push(eq(auditLog.piiDetected, filters.piiDetected));
  }
  if (filters.from) conds.push(gte(auditLog.timestamp, filters.from));
  if (filters.to) conds.push(lte(auditLog.timestamp, filters.to));

  const limit = Math.min(Math.max(filters.limit ?? 200, 1), 1000);
  const rows = await db
    .select()
    .from(auditLog)
    .where(and(...conds))
    .orderBy(desc(auditLog.timestamp))
    .limit(limit);
  return rows.map(rowToEntry);
}

function toCsvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : JSON.stringify(value);
  if (/["\n,]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function exportAuditLog(
  db: Db,
  companyId: string,
  format: "json" | "csv",
  filters: AuditLogFilters = {},
): Promise<{ content: string; contentType: string; filename: string }> {
  const entries = await getAuditLog(db, companyId, { ...filters, limit: 1000 });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");

  if (format === "json") {
    return {
      content: JSON.stringify(entries, null, 2),
      contentType: "application/json",
      filename: `audit-log-${ts}.json`,
    };
  }

  const headers = [
    "id",
    "timestamp",
    "companyId",
    "userId",
    "agentId",
    "action",
    "resource",
    "resourceId",
    "outcome",
    "riskLevel",
    "piiDetected",
    "ipAddress",
    "details",
  ];
  const lines = [headers.join(",")];
  for (const e of entries) {
    lines.push(
      [
        e.id,
        e.timestamp,
        e.companyId,
        e.userId ?? "",
        e.agentId ?? "",
        e.action,
        e.resource,
        e.resourceId ?? "",
        e.outcome,
        e.riskLevel,
        String(e.piiDetected),
        e.ipAddress ?? "",
        e.details ? JSON.stringify(e.details) : "",
      ]
        .map(toCsvCell)
        .join(","),
    );
  }
  return {
    content: lines.join("\n"),
    contentType: "text/csv",
    filename: `audit-log-${ts}.csv`,
  };
}

export async function countAuditEntries(db: Db, companyId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(auditLog)
    .where(eq(auditLog.companyId, companyId));
  return Number(row?.count ?? 0);
}
