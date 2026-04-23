import { execSync, spawn } from "node:child_process";
import {
  AiderExecutionError,
  AiderNotInstalledError,
  type AiderExecutionResult,
  type AiderExecutorOptions,
} from "./types.js";

const DEFAULT_MODEL = process.env.AIDER_MODEL ?? "claude-3-5-sonnet-20241022";
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

export function assertAiderInstalled(): void {
  try {
    execSync("which aider", { stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    throw new AiderNotInstalledError();
  }
}

export function isAiderInstalled(): boolean {
  try {
    assertAiderInstalled();
    return true;
  } catch {
    return false;
  }
}

export async function runAider(
  message: string,
  files: string[],
  options: AiderExecutorOptions = {},
): Promise<AiderExecutionResult> {
  assertAiderInstalled();

  const model = options.model ?? DEFAULT_MODEL;
  const args = [
    "--yes-always",
    "--no-git",
    "--model",
    model,
    "--message",
    message,
    ...(options.extraArgs ?? []),
    ...files,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn("aider", args, {
      cwd: options.cwd,
      env: process.env,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(
        new AiderExecutionError(
          `Aider timed out after ${options.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms`,
          -1,
          Buffer.concat(stderrChunks).toString("utf8"),
        ),
      );
    }, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    child.stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(err);
    });

    child.on("close", (exitCode) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const output = Buffer.concat(stdoutChunks).toString("utf8");
      const stderr = Buffer.concat(stderrChunks).toString("utf8");
      const code = exitCode ?? 0;
      const diff = extractDiffFromOutput(output);
      if (code !== 0) {
        reject(
          new AiderExecutionError(
            `Aider exited with code ${code}: ${stderr.slice(0, 500)}`,
            code,
            stderr,
          ),
        );
        return;
      }
      resolve({ diff, output, exitCode: code });
    });
  });
}

function extractDiffFromOutput(output: string): string {
  const lines = output.split("\n");
  const diffLines: string[] = [];
  let inDiff = false;
  for (const line of lines) {
    if (line.startsWith("diff --git") || line.startsWith("--- ") || line.startsWith("+++ ")) {
      inDiff = true;
    }
    if (inDiff) {
      diffLines.push(line);
    }
  }
  return diffLines.join("\n");
}

export function getDefaultModel(): string {
  return DEFAULT_MODEL;
}
