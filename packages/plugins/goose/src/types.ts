export type GooseTaskStatus = "running" | "completed" | "failed" | "cancelled";

export interface GooseTaskRecord {
  id: string;
  companyId: string;
  instructions: string;
  templateName: string | null;
  status: GooseTaskStatus;
  output: string;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

export interface GooseRunOptions {
  instructions: string;
  context?: string;
  companyId: string;
  templateName?: string;
}

export interface GooseRunHandle {
  taskId: string;
  status: GooseTaskStatus;
}

export interface GooseExecutorResult {
  status: "completed" | "failed" | "cancelled";
  output: string;
  exitCode: number | null;
}

export type TaskTemplateName =
  | "daily-operations"
  | "weekly-reporting"
  | "customer-followup";
