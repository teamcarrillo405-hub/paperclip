import { execFileSync } from "node:child_process";
import type { GitCommitSummary } from "./types.js";

export interface GitManagerOptions {
  cwd?: string;
}

function run(args: string[], cwd?: string): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

export function createBranch(branchName: string, options: GitManagerOptions = {}): void {
  run(["checkout", "-b", branchName], options.cwd);
}

export function commitChanges(message: string, options: GitManagerOptions = {}): string {
  run(["add", "-A"], options.cwd);
  run(["commit", "-m", message], options.cwd);
  return run(["rev-parse", "HEAD"], options.cwd).trim();
}

export function getDiff(options: GitManagerOptions = {}): string {
  return run(["diff", "HEAD"], options.cwd);
}

export function getRecentCommits(n = 10, options: GitManagerOptions = {}): GitCommitSummary[] {
  const output = run(["log", "--oneline", `-n`, String(n)], options.cwd);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const idx = line.indexOf(" ");
      if (idx < 0) return { hash: line, message: "" };
      return { hash: line.slice(0, idx), message: line.slice(idx + 1) };
    });
}

export function getCurrentBranch(options: GitManagerOptions = {}): string {
  return run(["rev-parse", "--abbrev-ref", "HEAD"], options.cwd).trim();
}
