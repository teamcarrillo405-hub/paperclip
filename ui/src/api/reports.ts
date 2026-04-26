import { api } from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReportsOverview {
  period: string;
  totalIssues: number;
  resolvedIssues: number;
  resolutionRate: number;
  activeAgents: number;
  totalCompanies: number;
  totalCostUsd: number;
  estimatedRoiUsd: number;
  avgResolutionHours: number;
}

export interface DailyIssueCount {
  date: string;
  created: number;
  resolved: number;
}

export interface CostByAgent {
  agentId: string;
  agentName: string;
  totalCostUsd: number;
  issueCount: number;
}

export interface CostByCompany {
  companyId: string;
  companyName: string;
  totalCostUsd: number;
  issueCount: number;
}

export interface ResolutionRateByAgent {
  agentId: string;
  agentName: string;
  total: number;
  resolved: number;
  rate: number;
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const reportsApi = {
  getOverview: (period: string) =>
    api.get<ReportsOverview>(`/reports/overview?period=${period}`),

  getIssuesByDay: (period: string) =>
    api.get<DailyIssueCount[]>(`/reports/issues-by-day?period=${period}`),

  getCostByAgent: (companyId: string, period: string) =>
    api.get<CostByAgent[]>(
      `/reports/cost-by-agent?period=${period}${companyId ? `&companyId=${companyId}` : ""}`,
    ),

  getCostByCompany: (period: string) =>
    api.get<CostByCompany[]>(`/reports/cost-by-company?period=${period}`),

  getResolutionRateByAgent: (companyId: string, period: string) =>
    api.get<ResolutionRateByAgent[]>(
      `/reports/resolution-rate-by-agent?period=${period}${companyId ? `&companyId=${companyId}` : ""}`,
    ),
};
