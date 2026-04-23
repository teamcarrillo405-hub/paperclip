import { api } from "./client";

export type GooseTaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface GooseTaskRecord {
  id: string;
  companyId: string;
  instructions: string;
  templateName: string | null;
  status: GooseTaskStatus;
  output: string;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
}

export interface GooseTaskTemplate {
  name: string;
  description: string;
  instructions: string;
}

export interface GooseStatus {
  installed: boolean;
  enabled: boolean;
  templates: string[];
  templateDetails: Record<string, GooseTaskTemplate>;
}

export interface GooseStartTaskRequest {
  instructions?: string;
  templateName?: string;
  variables?: Record<string, string>;
  context?: string;
}

export const gooseApi = {
  status: () => api.get<GooseStatus>("/goose/status"),
  list: () => api.get<GooseTaskRecord[]>("/goose/tasks"),
  get: (id: string) => api.get<GooseTaskRecord>(`/goose/tasks/${id}`),
  create: (body: GooseStartTaskRequest) =>
    api.post<GooseTaskRecord>("/goose/tasks", body),
  cancel: (id: string) => api.delete<GooseTaskRecord>(`/goose/tasks/${id}`),
};
