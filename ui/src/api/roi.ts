import { api } from "./client";

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

export const roiApi = {
  metrics: (companyId: string, period: RoiPeriod = "30d") =>
    api.get<RoiMetrics>(`/companies/${companyId}/roi/metrics?period=${period}`),
  timeline: (companyId: string, period: RoiPeriod = "30d") =>
    api.get<RoiTimeline>(`/companies/${companyId}/roi/timeline?period=${period}`),
};
