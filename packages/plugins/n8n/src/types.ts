/**
 * n8n REST API types.
 *
 * Only fields we actively read or surface are typed. The n8n API returns many
 * other fields which we pass through as Record<string, unknown> where needed.
 */

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  tags?: Array<{ id: string; name: string }>;
  createdAt?: string;
  updatedAt?: string;
  nodes?: N8nNode[];
  connections?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown> | null;
}

export interface N8nWorkflowSummary {
  id: string;
  name: string;
  active: boolean;
  tags: string[];
  updatedAt?: string;
  lastExecution?: N8nExecutionSummary | null;
}

export interface N8nNode {
  id?: string;
  name: string;
  type: string;
  typeVersion?: number;
  position?: [number, number];
  parameters?: Record<string, unknown>;
  webhookId?: string;
  credentials?: Record<string, unknown>;
}

export type N8nExecutionStatus =
  | "success"
  | "error"
  | "running"
  | "waiting"
  | "canceled"
  | "crashed"
  | "unknown";

export interface N8nExecution {
  id: string;
  workflowId: string;
  mode?: string;
  startedAt?: string;
  stoppedAt?: string;
  finished?: boolean;
  status?: string;
  retryOf?: string | null;
  retrySuccessId?: string | null;
}

export interface N8nExecutionSummary {
  id: string;
  workflowId: string;
  status: N8nExecutionStatus;
  startedAt?: string;
  stoppedAt?: string;
  durationMs?: number;
}

export interface N8nWorkflowListResponse {
  data: N8nWorkflow[];
  nextCursor?: string | null;
}

export interface N8nExecutionListResponse {
  data: N8nExecution[];
  nextCursor?: string | null;
}

/** Name of a bundled workflow template (JSON file under workflow-templates/). */
export type WorkflowTemplateName =
  | "lead-nurture"
  | "invoice-reminder"
  | "review-request";

/** Per-template configuration surface (applied on top of the template JSON). */
export interface WorkflowTemplateConfig {
  /** Override the created workflow's display name. */
  name?: string;
  /** Replace placeholder values inside node parameters — e.g. `{{customerName}}`. */
  variables?: Record<string, string>;
  /** Activate the workflow immediately after creation. Defaults to false. */
  activate?: boolean;
}
