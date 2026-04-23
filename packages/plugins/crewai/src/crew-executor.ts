import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CrewDefinition,
  CrewExecutionResult,
  CrewRunSpawnOptions,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

function resolveScriptPath(explicit?: string): string {
  if (explicit && existsSync(explicit)) return explicit;

  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(here, "../../../server/src/templates/run_crew.py.template"),
    path.resolve(here, "../../../../server/src/templates/run_crew.py.template"),
    path.resolve(process.cwd(), "server/src/templates/run_crew.py.template"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return candidates[0]!;
}

export function renderCrewPayload(
  definition: CrewDefinition,
  inputs: Record<string, unknown>,
): string {
  return JSON.stringify({ definition, inputs });
}

export interface CrewExecutorHandle {
  child: ChildProcess;
  done: Promise<CrewExecutionResult>;
  cancel: () => void;
}

export function spawnCrewRun(
  definition: CrewDefinition,
  inputs: Record<string, unknown>,
  opts: CrewRunSpawnOptions = {},
): CrewExecutorHandle {
  const pythonBin = opts.pythonBin ?? process.env.CREWAI_PYTHON_BIN ?? "python3";
  const scriptPath = resolveScriptPath(opts.scriptPath);
  const payload = renderCrewPayload(definition, inputs);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const child = spawn(pythonBin, [scriptPath, payload], {
    cwd: opts.cwd ?? process.cwd(),
    env: {
      ...process.env,
      ...(opts.env ?? {}),
      OPENAI_API_KEY: opts.env?.OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";
  let cancelled = false;
  child.stdout?.on("data", (chunk: Buffer) => {
    stdout += chunk.toString("utf8");
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString("utf8");
  });

  const timer = setTimeout(() => {
    if (!child.killed) child.kill("SIGTERM");
  }, timeoutMs);

  const done = new Promise<CrewExecutionResult>((resolve) => {
    child.on("error", (err) => {
      clearTimeout(timer);
      const hint =
        (err as NodeJS.ErrnoException).code === "ENOENT"
          ? `Python interpreter '${pythonBin}' not found. Install Python 3 and 'crewai' (pip install crewai), or set CREWAI_PYTHON_BIN.`
          : err.message;
      resolve({
        status: "failed",
        output: stdout,
        error: `Failed to start crew process: ${hint}`,
      });
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      if (cancelled) {
        resolve({ status: "cancelled", output: stdout, error: "Run cancelled." });
        return;
      }
      if (code === 0) {
        resolve({ status: "succeeded", output: stdout || stderr });
        return;
      }
      resolve({
        status: "failed",
        output: stdout,
        error: stderr || `crew process exited with code ${code} signal ${signal ?? "none"}`,
      });
    });
  });

  return {
    child,
    done,
    cancel: () => {
      cancelled = true;
      if (!child.killed) child.kill("SIGTERM");
    },
  };
}
