import { spawn, type ChildProcess } from "node:child_process";
import type { GooseExecutorResult } from "./types.js";

export class GooseNotInstalledError extends Error {
  constructor() {
    super(
      "Goose CLI is not installed or not on PATH. Install from https://block.github.io/goose/ and ensure the `goose` binary is available.",
    );
    this.name = "GooseNotInstalledError";
  }
}

export interface GooseExecutorOptions {
  binary?: string;
  env?: NodeJS.ProcessEnv;
  /** Extra arguments appended after the built-in ones. */
  extraArgs?: string[];
}

export interface GooseRunningProcess {
  child: ChildProcess;
  result: Promise<GooseExecutorResult>;
  kill(): void;
}

/**
 * Spawn the Goose CLI with the given instructions and return a handle that
 * exposes the child process, a Promise for the final result, and a `kill()`
 * method so callers can cancel the run.
 */
export function spawnGooseTask(
  instructions: string,
  opts: GooseExecutorOptions = {},
): GooseRunningProcess {
  const binary = opts.binary ?? process.env.GOOSE_BIN ?? "goose";
  const args = ["run", "--instructions", instructions, "--no-interactive"];
  if (opts.extraArgs && opts.extraArgs.length > 0) args.push(...opts.extraArgs);

  let child: ChildProcess;
  try {
    child = spawn(binary, args, {
      env: opts.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      throw new GooseNotInstalledError();
    }
    throw err;
  }

  let killed = false;
  let outBuf = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    outBuf += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    outBuf += chunk.toString("utf8");
  });

  const result = new Promise<GooseExecutorResult>((resolvePromise) => {
    child.on("error", (err) => {
      const errnoErr = err as NodeJS.ErrnoException;
      if (errnoErr.code === "ENOENT") {
        resolvePromise({
          status: "failed",
          output:
            outBuf +
            "\n[goose-executor] Goose CLI binary not found on PATH. Install from https://block.github.io/goose/",
          exitCode: null,
        });
        return;
      }
      resolvePromise({
        status: "failed",
        output: outBuf + `\n[goose-executor] Spawn error: ${err.message}`,
        exitCode: null,
      });
    });

    child.on("exit", (code, signal) => {
      if (killed) {
        resolvePromise({
          status: "cancelled",
          output: outBuf,
          exitCode: code,
        });
        return;
      }
      if (signal && code === null) {
        resolvePromise({
          status: "cancelled",
          output: outBuf,
          exitCode: null,
        });
        return;
      }
      if (code === 0) {
        resolvePromise({
          status: "completed",
          output: outBuf,
          exitCode: 0,
        });
      } else {
        resolvePromise({
          status: "failed",
          output: outBuf,
          exitCode: code,
        });
      }
    });
  });

  const kill = () => {
    if (killed) return;
    killed = true;
    try {
      child.kill("SIGTERM");
    } catch {
      /* ignore */
    }
  };

  return { child, result, kill };
}
