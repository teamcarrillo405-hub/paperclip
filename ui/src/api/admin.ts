import { api } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModelPolicies = {
  allowedModels: string[];
  maxBudgetPerAgentMonthly: number;
  requireApprovalAbove: number;
  restrictedCompanies: Array<{ companyId: string; allowedModels: string[] }>;
};

export type AdminUserCompany = {
  companyId: string;
  companyName: string | null;
  membershipRole: string | null;
  status: string;
};

export type AdminUser = {
  id: string;
  email: string | null;
  name: string | null;
  createdAt: string | null;
  companies: AdminUserCompany[];
};

export type AdminUsersResponse = {
  users: AdminUser[];
  total: number;
  page: number;
};

export type AdminUserDetail = {
  id: string;
  email: string | null;
  name: string | null;
  memberships: Array<{
    companyId: string;
    companyName: string | null;
    companyStatus: string | null;
    membershipRole: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
  }>;
  recentActivity: AuditLogRow[];
};

export type UsageRow = {
  id: string;
  name: string | null;
  companyName?: string | null;
  provider?: string | null;
  totalCents: number;
  eventCount: number;
};

export type UsageResponse = {
  groupBy: string;
  period: string;
  rows: UsageRow[];
};

export type TopAgentRow = {
  agentId: string;
  agentName: string;
  companyName: string;
  totalCents: number;
};

export type TopCompanyRow = {
  companyId: string;
  companyName: string;
  totalCents: number;
};

export type AuditLogRow = {
  id: string;
  companyId: string;
  userId: string | null;
  agentId: string | null;
  action: string;
  resource: string;
  resourceId: string | null;
  details: Record<string, unknown> | null;
  ipAddress: string | null;
  outcome: string;
  riskLevel: string;
  piiDetected: boolean;
  timestamp: string;
};

export type AuditLogResponse = {
  rows: AuditLogRow[];
  total: number;
  page: number;
  limit: number;
};

export type SystemInfo = {
  nodeVersion: string;
  uptime: number;
  uptimeFormatted: string;
  memoryUsage: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  dbVersion: string;
  totalUsers: number;
  totalCompanies: number;
  totalAgents: number;
  totalIssues: number;
  totalCostEvents: number;
  env: string;
};

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const p = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== "") {
      p.set(key, String(val));
    }
  }
  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export const adminApi = {
  // Users
  listUsers: (opts: {
    search?: string;
    companyId?: string;
    page?: number;
    limit?: number;
  } = {}) =>
    api.get<AdminUsersResponse>(
      `/admin/users${buildQuery({ search: opts.search, companyId: opts.companyId, page: opts.page, limit: opts.limit })}`,
    ),

  getUser: (id: string) => api.get<AdminUserDetail>(`/admin/users/${id}`),

  updateUser: (id: string, body: { active?: boolean; role?: string }) =>
    api.patch<{ success: boolean; userId: string }>(`/admin/users/${id}`, body),

  deactivateUser: (id: string) =>
    api.delete<{ success: boolean; userId: string }>(`/admin/users/${id}`),

  // Usage
  getUsage: (opts: { period?: string; groupBy?: string } = {}) =>
    api.get<UsageResponse>(
      `/admin/usage${buildQuery({ period: opts.period, groupBy: opts.groupBy })}`,
    ),

  getTopAgents: () => api.get<TopAgentRow[]>("/admin/usage/top-agents"),

  getTopCompanies: () => api.get<TopCompanyRow[]>("/admin/usage/top-companies"),

  // Model policies
  getModelPolicies: () => api.get<ModelPolicies>("/admin/model-policies"),

  saveModelPolicies: (policies: ModelPolicies) =>
    api.put<ModelPolicies>("/admin/model-policies", policies),

  // Audit log
  getAuditLog: (opts: {
    page?: number;
    limit?: number;
    userId?: string;
    companyId?: string;
    action?: string;
    from?: string;
    to?: string;
  } = {}) =>
    api.get<AuditLogResponse>(
      `/admin/audit-log${buildQuery({
        page: opts.page,
        limit: opts.limit,
        userId: opts.userId,
        companyId: opts.companyId,
        action: opts.action,
        from: opts.from,
        to: opts.to,
      })}`,
    ),

  // System
  getSystem: () => api.get<SystemInfo>("/admin/system"),
};
