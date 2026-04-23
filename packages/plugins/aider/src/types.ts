export type AiderRunStatus = "pending" | "running" | "complete" | "failed";

export interface AiderExecutionResult {
  diff: string;
  output: string;
  exitCode: number;
}

export interface AiderExecutorOptions {
  model?: string;
  cwd?: string;
  extraArgs?: string[];
  timeoutMs?: number;
}

export interface FixBugArgs {
  description: string;
  files: string[];
  model?: string;
}

export interface AddFeatureArgs {
  description: string;
  files: string[];
  model?: string;
}

export interface WriteTestsArgs {
  files: string[];
  model?: string;
}

export interface RefactorCodeArgs {
  files: string[];
  instructions: string;
  model?: string;
}

export interface CreateBranchAndFixArgs {
  issueDescription: string;
  files?: string[];
  model?: string;
  branchPrefix?: string;
}

export interface GitCommitSummary {
  hash: string;
  message: string;
}

export class AiderNotInstalledError extends Error {
  constructor(message = "Aider is not installed. Install it with: pip install aider-chat") {
    super(message);
    this.name = "AiderNotInstalledError";
  }
}

export class AiderExecutionError extends Error {
  readonly exitCode: number;
  readonly stderr: string;
  constructor(message: string, exitCode: number, stderr: string) {
    super(message);
    this.name = "AiderExecutionError";
    this.exitCode = exitCode;
    this.stderr = stderr;
  }
}
