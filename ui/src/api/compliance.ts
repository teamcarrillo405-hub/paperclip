import { api } from "./client";

export type AuditOutcome = "success" | "failure" | "blocked";
export type AuditRiskLevel = "low" | "medium" | "high" | "critical";

export interface AuditEntry {
  id: string;
  companyId: string;
  userId: string | null;
  agentId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  outcome: AuditOutcome;
  riskLevel: AuditRiskLevel;
  piiDetected: boolean;
  timestamp: string;
}

export interface AuditLogFilters {
  agentId?: string;
  userId?: string;
  action?: string;
  resource?: string;
  outcome?: AuditOutcome;
  riskLevel?: AuditRiskLevel;
  piiDetected?: boolean;
  from?: string;
  to?: string;
  limit?: number;
}

export interface RetentionPolicy {
  runLogDays: number | null;
  auditLogDays: number | null;
  billingDays: number | null;
  activityDays: number | null;
}

export interface GuardrailConfig {
  bulkOpThreshold: number;
  blockBillingMutations: boolean;
  highValueMentionsRequireApproval: boolean;
  highValueThreshold: number;
}

export interface GuardrailTrigger {
  id: string;
  timestamp: string;
  rule: string | unknown;
  attemptedAction: string | unknown;
  resource: string;
  reason: string | unknown;
}

export interface DataSummary {
  auditEntries: number;
  activityEntries: number;
  runs: number;
}

function toQuery(params: Record<string, unknown>): string {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  const qs = new URLSearchParams();
  for (const [k, v] of entries) qs.append(k, String(v));
  return `?${qs.toString()}`;
}

export const complianceApi = {
  async listAudit(
    companyId: string,
    filters: AuditLogFilters = {},
  ): Promise<{ entries: AuditEntry[] }> {
    return api.get(
      `/companies/${encodeURIComponent(companyId)}/compliance/audit${toQuery(filters as Record<string, unknown>)}`,
    );
  },
  auditExportUrl(companyId: string, format: "json" | "csv"): string {
    return `/api/companies/${encodeURIComponent(companyId)}/compliance/audit/export?format=${format}`;
  },
  async getRetention(companyId: string): Promise<{ policy: RetentionPolicy }> {
    return api.get(`/companies/${encodeURIComponent(companyId)}/compliance/retention`);
  },
  async updateRetention(
    companyId: string,
    policy: Partial<RetentionPolicy>,
  ): Promise<{ policy: RetentionPolicy }> {
    return api.put(
      `/companies/${encodeURIComponent(companyId)}/compliance/retention`,
      policy,
    );
  },
  async getGuardrails(companyId: string): Promise<{ config: GuardrailConfig }> {
    return api.get(`/companies/${encodeURIComponent(companyId)}/compliance/guardrails`);
  },
  async updateGuardrails(
    companyId: string,
    config: Partial<GuardrailConfig>,
  ): Promise<{ config: GuardrailConfig }> {
    return api.put(
      `/companies/${encodeURIComponent(companyId)}/compliance/guardrails`,
      config,
    );
  },
  async guardrailTriggers(companyId: string): Promise<{ triggers: GuardrailTrigger[] }> {
    return api.get(
      `/companies/${encodeURIComponent(companyId)}/compliance/guardrails/triggers`,
    );
  },
  async dataSummary(companyId: string): Promise<{ summary: DataSummary }> {
    return api.get(`/companies/${encodeURIComponent(companyId)}/compliance/data-summary`);
  },
  async deleteData(companyId: string, confirm: string): Promise<unknown> {
    return api.post(
      `/companies/${encodeURIComponent(companyId)}/compliance/delete-data`,
      { confirm },
    );
  },
};
