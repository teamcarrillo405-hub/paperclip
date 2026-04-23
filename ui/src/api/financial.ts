import { api } from "./client";

export type FinancialHealthLabel = "Excellent" | "Good" | "Fair" | "Needs Attention";

export interface FinancialSummary {
  period: string;
  healthScore: number;
  healthLabel: FinancialHealthLabel;
  headline: string;
  insights: string[];
  alerts: string[];
  recommendations: string[];
  revenue: number;
  expenses: number;
  netIncome: number;
  outstandingAR: number;
  overdueInvoices: number;
}

export interface FinancialHealthScore {
  healthScore: number;
  healthLabel: FinancialHealthLabel;
  period: string;
}

export class QuickBooksNotConnectedError extends Error {
  constructor(message = "QuickBooks is not connected") {
    super(message);
    this.name = "QuickBooksNotConnectedError";
  }
}

export const financialApi = {
  async summary(companyId: string, period: string = "current"): Promise<FinancialSummary> {
    return api.get<FinancialSummary>(
      `/financial/summary?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`,
    );
  },
  async healthScore(companyId: string, period: string = "current"): Promise<FinancialHealthScore> {
    return api.get<FinancialHealthScore>(
      `/financial/health-score?companyId=${encodeURIComponent(companyId)}&period=${encodeURIComponent(period)}`,
    );
  },
  async refresh(companyId: string, period: string = "current"): Promise<FinancialSummary> {
    return api.post<FinancialSummary>("/financial/refresh", { companyId, period });
  },
};
