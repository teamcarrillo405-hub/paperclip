import { api } from "./client";

export interface GuardianIncident {
  id: string;
  companyId: string;
  watchdog: string;
  agentId: string | null;
  agentName: string | null;
  runId: string | null;
  issueId: string | null;
  incidentType: string;
  severity: "info" | "warning" | "critical";
  description: string;
  recommendedAction: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  autoActionTaken: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GuardianStatus {
  enabled: boolean;
  config: {
    enabled: boolean;
    watchdogOne: {
      enabled: boolean;
      stallThresholdMinutes: number;
      maxContinuationAttempts: number;
      checkIntervalMs: number;
    };
    watchdogTwo: {
      enabled: boolean;
      checkIntervalMs: number;
      qualityCheckDelayMs: number;
    };
  };
  watchdogOne: {
    enabled: boolean;
    lastRunAt: string | null;
    lastReport: {
      scannedRuns: number;
      stalledRuns: number;
      retriesScheduled: number;
      retriesExhausted: number;
      blockersDetected: number;
      incidentsCreated: number;
      ranAt: string;
    } | null;
  };
  watchdogTwo: {
    enabled: boolean;
    lastRunAt: string | null;
    lastReport: {
      scannedRuns: number;
      reviewedRuns: number;
      incidentsCreated: number;
      escalations: number;
      ranAt: string;
    } | null;
  };
}

export interface GuardianSummary {
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  byWatchdog: Record<string, number>;
  resolvedToday: number;
  totalOpen: number;
}

export const guardianApi = {
  status: () => api.get<GuardianStatus>("/guardian/status"),
  incidents: (companyId: string, opts?: { limit?: number; resolved?: boolean }) => {
    const params = new URLSearchParams({ companyId });
    if (opts?.limit != null) params.set("limit", String(opts.limit));
    if (opts?.resolved != null) params.set("resolved", String(opts.resolved));
    return api.get<{ incidents: GuardianIncident[] }>(`/guardian/incidents?${params.toString()}`);
  },
  summary: (companyId: string) =>
    api.get<GuardianSummary>(`/guardian/incidents/summary?companyId=${companyId}`),
  resolve: (id: string) =>
    api.post<{ incident: GuardianIncident }>(`/guardian/incidents/${id}/resolve`, {}),
};
