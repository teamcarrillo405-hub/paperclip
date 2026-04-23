import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { auditLog } from "@paperclipai/db";
import {
  getAuditLog,
  exportAuditLog,
  type AuditLogFilters,
  type AuditOutcome,
  type AuditRiskLevel,
} from "../services/audit-log.js";
import {
  DEFAULT_RETENTION,
  applyRetentionPolicy,
  deleteCompanyUserData,
  getCompanyDataSummary,
  type RetentionPolicy,
} from "../services/data-retention.js";
import { DEFAULT_GUARDRAIL_CONFIG, type GuardrailConfig } from "../middleware/guardrails.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

// In-memory per-company overrides for retention + guardrails.
// Persisting these to the DB would require a dedicated table — for now these
// act as runtime toggles that the UI can update and the server reads.
const retentionOverrides = new Map<string, RetentionPolicy>();
const guardrailOverrides = new Map<string, GuardrailConfig>();

export function getRetentionPolicy(companyId: string): RetentionPolicy {
  return retentionOverrides.get(companyId) ?? DEFAULT_RETENTION;
}

export function getGuardrailConfig(companyId: string): GuardrailConfig {
  return guardrailOverrides.get(companyId) ?? DEFAULT_GUARDRAIL_CONFIG;
}

export function complianceRoutes(db: Db) {
  const router = Router();

  router.get("/companies/:companyId/compliance/audit", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);

    const filters: AuditLogFilters = {
      agentId: typeof req.query.agentId === "string" ? req.query.agentId : undefined,
      userId: typeof req.query.userId === "string" ? req.query.userId : undefined,
      action: typeof req.query.action === "string" ? req.query.action : undefined,
      resource: typeof req.query.resource === "string" ? req.query.resource : undefined,
      outcome:
        typeof req.query.outcome === "string"
          ? (req.query.outcome as AuditOutcome)
          : undefined,
      riskLevel:
        typeof req.query.riskLevel === "string"
          ? (req.query.riskLevel as AuditRiskLevel)
          : undefined,
      piiDetected:
        req.query.piiDetected === "true"
          ? true
          : req.query.piiDetected === "false"
            ? false
            : undefined,
      from: typeof req.query.from === "string" ? new Date(req.query.from) : undefined,
      to: typeof req.query.to === "string" ? new Date(req.query.to) : undefined,
      limit:
        typeof req.query.limit === "string"
          ? Number.parseInt(req.query.limit, 10)
          : undefined,
    };

    const entries = await getAuditLog(db, companyId, filters);
    res.json({ entries });
  });

  router.get("/companies/:companyId/compliance/audit/export", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const format = (req.query.format as string) === "csv" ? "csv" : "json";
    const { content, contentType, filename } = await exportAuditLog(db, companyId, format);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(content);
  });

  router.get("/companies/:companyId/compliance/guardrails/triggers", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.companyId, companyId))
      .orderBy(desc(auditLog.timestamp))
      .limit(200);
    const triggers = rows
      .filter((r) => r.action === "guardrail.triggered")
      .slice(0, 50)
      .map((r) => ({
        id: r.id,
        timestamp: r.timestamp,
        rule: (r.details as Record<string, unknown> | null)?.rule ?? "unknown",
        attemptedAction:
          (r.details as Record<string, unknown> | null)?.attemptedAction ?? "",
        resource: r.resource,
        reason: (r.details as Record<string, unknown> | null)?.reason ?? "",
      }));
    res.json({ triggers });
  });

  router.get("/companies/:companyId/compliance/retention", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ policy: getRetentionPolicy(companyId) });
  });

  router.put("/companies/:companyId/compliance/retention", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as Partial<RetentionPolicy> | undefined;
    if (!body) throw badRequest("body required");
    const current = getRetentionPolicy(companyId);
    const merged: RetentionPolicy = {
      runLogDays: body.runLogDays !== undefined ? body.runLogDays : current.runLogDays,
      auditLogDays:
        body.auditLogDays !== undefined ? body.auditLogDays : current.auditLogDays,
      billingDays: body.billingDays !== undefined ? body.billingDays : current.billingDays,
      activityDays:
        body.activityDays !== undefined ? body.activityDays : current.activityDays,
    };
    retentionOverrides.set(companyId, merged);
    res.json({ policy: merged });
  });

  router.post("/companies/:companyId/compliance/retention/apply", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await applyRetentionPolicy(db, companyId, getRetentionPolicy(companyId));
    res.json({ result });
  });

  router.get("/companies/:companyId/compliance/data-summary", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const summary = await getCompanyDataSummary(db, companyId);
    res.json({ summary });
  });

  router.post("/companies/:companyId/compliance/delete-data", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const confirm = (req.body as { confirm?: string } | undefined)?.confirm;
    if (confirm !== "DELETE") {
      throw badRequest("confirm field must equal \"DELETE\" to proceed");
    }
    const result = await deleteCompanyUserData(db, companyId);
    res.json({ result });
  });

  router.get("/companies/:companyId/compliance/guardrails", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ config: getGuardrailConfig(companyId) });
  });

  router.put("/companies/:companyId/compliance/guardrails", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as Partial<GuardrailConfig> | undefined;
    if (!body) throw badRequest("body required");
    const current = getGuardrailConfig(companyId);
    const merged: GuardrailConfig = {
      bulkOpThreshold:
        typeof body.bulkOpThreshold === "number" ? body.bulkOpThreshold : current.bulkOpThreshold,
      blockBillingMutations:
        typeof body.blockBillingMutations === "boolean"
          ? body.blockBillingMutations
          : current.blockBillingMutations,
      highValueMentionsRequireApproval:
        typeof body.highValueMentionsRequireApproval === "boolean"
          ? body.highValueMentionsRequireApproval
          : current.highValueMentionsRequireApproval,
      highValueThreshold:
        typeof body.highValueThreshold === "number"
          ? body.highValueThreshold
          : current.highValueThreshold,
    };
    guardrailOverrides.set(companyId, merged);
    res.json({ config: merged });
  });

  return router;
}
