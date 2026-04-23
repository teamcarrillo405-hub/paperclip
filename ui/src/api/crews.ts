import { api } from "./client";

export interface CrewAgent {
  role: string;
  goal: string;
  backstory: string;
}

export interface CrewTask {
  description: string;
  agent: string;
  expectedOutput?: string;
}

export interface CrewInputField {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
}

export interface CrewSummary {
  id: string;
  name: string;
  description: string;
  goal: string;
  agents: CrewAgent[];
  tasks: CrewTask[];
  inputSchema: CrewInputField[];
}

export type CrewRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface CrewRun {
  id: string;
  companyId: string;
  crewName: string;
  inputs: Record<string, unknown>;
  status: CrewRunStatus;
  output: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export const crewsApi = {
  list: () => api.get<CrewSummary[]>("/crews"),
  run: (crewId: string, input: string) =>
    api.post<{ runId: string; status: CrewRunStatus }>("/crews/run", {
      crewId,
      input,
    }),
  listRuns: (limit = 20) => api.get<CrewRun[]>(`/crews/runs?limit=${limit}`),
  getRun: (runId: string) => api.get<CrewRun>(`/crews/runs/${runId}`),
};
