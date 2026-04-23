import { api } from "./client";

export interface AiderStatus {
  installed: boolean;
  model: string;
  autoFixEnabled: boolean;
  enabled: boolean;
}

export type AiderRunStatus = "pending" | "running" | "complete" | "failed";

export interface AiderRun {
  id: string;
  companyId: string;
  description: string;
  files: string[];
  status: AiderRunStatus;
  diff: string | null;
  branchName: string | null;
  commitHash: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiderFixRequest {
  description: string;
  files: string[];
  createBranch?: boolean;
}

export const aiderApi = {
  status: () => api.get<AiderStatus>("/aider/status"),
  history: () => api.get<AiderRun[]>("/aider/history"),
  fix: (body: AiderFixRequest) => api.post<AiderRun>("/aider/fix", body),
};
