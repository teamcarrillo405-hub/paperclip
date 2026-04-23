export interface CrewAgentDefinition {
  role: string;
  goal: string;
  backstory: string;
}

export interface CrewTaskDefinition {
  description: string;
  agent: string;
  expectedOutput?: string;
}

export interface CrewDefinition {
  name: string;
  goal: string;
  description?: string;
  agents: CrewAgentDefinition[];
  tasks: CrewTaskDefinition[];
  inputSchema?: Array<{
    name: string;
    label?: string;
    required?: boolean;
    description?: string;
  }>;
}

export type CrewRunStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface CrewRunRecord {
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

export interface CrewRunSpawnOptions {
  pythonBin?: string;
  scriptPath?: string;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  timeoutMs?: number;
}

export interface CrewExecutionResult {
  status: "succeeded" | "failed" | "cancelled";
  output: string;
  error?: string;
}
