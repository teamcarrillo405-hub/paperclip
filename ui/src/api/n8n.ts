import { api } from "./client";

export interface N8nStatusResponse {
  connected: boolean;
  workflowCount: number;
  message?: string;
  baseUrl: string;
}

export type N8nExecutionStatus =
  | "success"
  | "error"
  | "running"
  | "waiting"
  | "canceled"
  | "crashed"
  | "unknown";

export interface N8nExecutionSummary {
  id: string;
  workflowId: string;
  status: N8nExecutionStatus;
  startedAt?: string;
  stoppedAt?: string;
  durationMs?: number;
}

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  tags: string[];
  updatedAt?: string;
  lastExecution?: N8nExecutionSummary | null;
}

export type N8nTemplateName = "lead-nurture" | "invoice-reminder" | "review-request";

export interface CreateFromTemplateBody {
  templateName: N8nTemplateName;
  config?: {
    name?: string;
    variables?: Record<string, string>;
    activate?: boolean;
  };
}

export const n8nApi = {
  getStatus: () => api.get<N8nStatusResponse>("/n8n/status"),
  listWorkflows: () => api.get<{ workflows: N8nWorkflowSummary[] }>("/n8n/workflows"),
  triggerWorkflow: (id: string, data?: unknown) =>
    api.post<{ ok: true; result: unknown }>(`/n8n/workflows/${encodeURIComponent(id)}/trigger`, { data }),
  getExecutions: (id: string, limit = 20) =>
    api.get<{ executions: N8nExecutionSummary[] }>(
      `/n8n/workflows/${encodeURIComponent(id)}/executions?limit=${limit}`,
    ),
  createFromTemplate: (body: CreateFromTemplateBody) =>
    api.post<{ workflow: N8nWorkflowSummary }>(`/n8n/workflows/from-template`, body),
  toggleWorkflow: (id: string) =>
    api.patch<{ workflow: N8nWorkflowSummary }>(
      `/n8n/workflows/${encodeURIComponent(id)}/toggle`,
      {},
    ),
};
