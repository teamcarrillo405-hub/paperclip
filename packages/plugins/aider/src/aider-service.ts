import { getDefaultModel, isAiderInstalled, runAider } from "./aider-executor.js";
import {
  commitChanges,
  createBranch,
  getDiff,
  getRecentCommits,
} from "./git-manager.js";
import type {
  AddFeatureArgs,
  AiderExecutionResult,
  CreateBranchAndFixArgs,
  FixBugArgs,
  GitCommitSummary,
  RefactorCodeArgs,
  WriteTestsArgs,
} from "./types.js";

export interface AiderServiceOptions {
  cwd?: string;
  defaultModel?: string;
}

export interface BranchAndFixResult extends AiderExecutionResult {
  branchName: string;
  commitHash: string;
}

export class AiderService {
  private readonly cwd?: string;
  private readonly defaultModel: string;

  constructor(options: AiderServiceOptions = {}) {
    this.cwd = options.cwd;
    this.defaultModel = options.defaultModel ?? getDefaultModel();
  }

  isInstalled(): boolean {
    return isAiderInstalled();
  }

  getModel(): string {
    return this.defaultModel;
  }

  async fixBug(args: FixBugArgs): Promise<AiderExecutionResult> {
    const message = `Fix the following bug: ${args.description}`;
    return runAider(message, args.files, {
      model: args.model ?? this.defaultModel,
      cwd: this.cwd,
    });
  }

  async addFeature(args: AddFeatureArgs): Promise<AiderExecutionResult> {
    const message = `Add the following feature: ${args.description}`;
    return runAider(message, args.files, {
      model: args.model ?? this.defaultModel,
      cwd: this.cwd,
    });
  }

  async writeTests(args: WriteTestsArgs): Promise<AiderExecutionResult> {
    const message = `Write comprehensive tests for the provided files. Cover the primary code paths and edge cases.`;
    return runAider(message, args.files, {
      model: args.model ?? this.defaultModel,
      cwd: this.cwd,
    });
  }

  async refactorCode(args: RefactorCodeArgs): Promise<AiderExecutionResult> {
    const message = `Refactor the provided files per these instructions: ${args.instructions}`;
    return runAider(message, args.files, {
      model: args.model ?? this.defaultModel,
      cwd: this.cwd,
    });
  }

  async createBranchAndFix(args: CreateBranchAndFixArgs): Promise<BranchAndFixResult> {
    const branchName = buildBranchName(args.branchPrefix ?? "aider-fix", args.issueDescription);
    createBranch(branchName, { cwd: this.cwd });
    const result = await runAider(
      `Resolve the following issue: ${args.issueDescription}`,
      args.files ?? [],
      { model: args.model ?? this.defaultModel, cwd: this.cwd },
    );
    const commitMessage = truncate(`aider: ${args.issueDescription}`, 72);
    const commitHash = commitChanges(commitMessage, { cwd: this.cwd });
    return { ...result, branchName, commitHash };
  }

  getGitDiff(): string {
    return getDiff({ cwd: this.cwd });
  }

  listRecentCommits(limit = 10): GitCommitSummary[] {
    return getRecentCommits(limit, { cwd: this.cwd });
  }
}

function buildBranchName(prefix: string, description: string): string {
  const slug = description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const stamp = Date.now().toString(36);
  return `${prefix}/${slug || "issue"}-${stamp}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
