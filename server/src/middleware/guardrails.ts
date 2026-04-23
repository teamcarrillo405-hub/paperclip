import type { Db } from "@paperclipai/db";
import { logAuditEntry } from "../services/audit-log.js";

export interface GuardrailConfig {
  bulkOpThreshold: number;
  blockBillingMutations: boolean;
  highValueMentionsRequireApproval: boolean;
  highValueThreshold: number;
}

export const DEFAULT_GUARDRAIL_CONFIG: GuardrailConfig = {
  bulkOpThreshold: 50,
  blockBillingMutations: true,
  highValueMentionsRequireApproval: true,
  highValueThreshold: 10000,
};

export type GuardrailRule =
  | "bulk_op_without_confirmation"
  | "billing_data_modification"
  | "high_value_without_approval";

export interface GuardrailContext {
  companyId: string;
  userId?: string | null;
  agentId?: string | null;
  action: string;
  resource: string;
  resourceId?: string | null;
  ipAddress?: string | null;
  itemCount?: number;
  confirmed?: boolean;
  approved?: boolean;
  value?: number;
  details?: Record<string, unknown>;
}

export interface GuardrailDecision {
  allowed: boolean;
  rule?: GuardrailRule;
  reason?: string;
}

export function evaluateGuardrail(
  ctx: GuardrailContext,
  config: GuardrailConfig = DEFAULT_GUARDRAIL_CONFIG,
): GuardrailDecision {
  if (
    config.blockBillingMutations &&
    ctx.resource.startsWith("billing") &&
    ctx.action !== "read" &&
    !ctx.approved
  ) {
    return {
      allowed: false,
      rule: "billing_data_modification",
      reason: `Billing data is protected; action "${ctx.action}" requires explicit approval`,
    };
  }

  if (
    typeof ctx.itemCount === "number" &&
    ctx.itemCount > config.bulkOpThreshold &&
    !ctx.confirmed
  ) {
    return {
      allowed: false,
      rule: "bulk_op_without_confirmation",
      reason: `Bulk operation (${ctx.itemCount} items) exceeds threshold ${config.bulkOpThreshold} and requires confirmation`,
    };
  }

  if (
    config.highValueMentionsRequireApproval &&
    typeof ctx.value === "number" &&
    ctx.value >= config.highValueThreshold &&
    !ctx.approved
  ) {
    return {
      allowed: false,
      rule: "high_value_without_approval",
      reason: `Operation value ${ctx.value} exceeds approval threshold ${config.highValueThreshold}`,
    };
  }

  return { allowed: true };
}

export async function enforceGuardrail(
  db: Db,
  ctx: GuardrailContext,
  config: GuardrailConfig = DEFAULT_GUARDRAIL_CONFIG,
): Promise<GuardrailDecision> {
  const decision = evaluateGuardrail(ctx, config);
  if (!decision.allowed) {
    await logAuditEntry(db, {
      companyId: ctx.companyId,
      userId: ctx.userId ?? null,
      agentId: ctx.agentId ?? null,
      action: "guardrail.triggered",
      resource: ctx.resource,
      resourceId: ctx.resourceId ?? null,
      ipAddress: ctx.ipAddress ?? null,
      outcome: "blocked",
      riskLevel: decision.rule === "billing_data_modification" ? "high" : "medium",
      details: {
        rule: decision.rule,
        reason: decision.reason,
        attemptedAction: ctx.action,
        itemCount: ctx.itemCount,
        value: ctx.value,
        ...ctx.details,
      },
    });
  }
  return decision;
}

export interface GuardrailTriggerSummary {
  rule: string;
  timestamp: string;
  attemptedAction: string;
  resource: string;
  reason?: string;
}
