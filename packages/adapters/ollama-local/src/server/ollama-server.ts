import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";

export type OllamaStartupStatus =
  | "already_running"
  | "started"
  | "disabled"
  | "skipped_non_loopback";

export type OllamaStartupResult = {
  status: OllamaStartupStatus;
  baseUrl: string;
  command?: string;
  message: string;
};

type FetchLike = typeof fetch;
type SpawnLike = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

type EnsureOllamaServerOptions = {
  baseUrl: string;
  autoStart: boolean;
  ollamaPath?: string;
  startupTimeoutMs?: number;
  fetchImpl?: FetchLike;
  spawnImpl?: SpawnLike;
  sleepImpl?: (ms: number) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isLoopbackOllamaUrl(baseUrl: string): boolean {
  try {
    const url = new URL(baseUrl);
    return ["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname);
  } catch {
    return false;
  }
}

function fileExists(filePath: string): boolean {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

export function resolveOllamaCommand(configuredPath = ""): string {
  const trimmed = configuredPath.trim();
  if (trimmed) return trimmed;

  const candidates = [
    process.env.OLLAMA_PATH,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Programs", "Ollama", "ollama.exe")
      : "",
    process.platform === "win32" && process.env.ProgramFiles
      ? path.join(process.env.ProgramFiles, "Ollama", "ollama.exe")
      : "",
    process.platform === "win32" && process.env["ProgramFiles(x86)"]
      ? path.join(process.env["ProgramFiles(x86)"]!, "Ollama", "ollama.exe")
      : "",
    process.platform === "darwin" ? "/Applications/Ollama.app/Contents/Resources/ollama" : "",
    process.platform !== "win32" ? "/usr/local/bin/ollama" : "",
    process.platform !== "win32" ? "/opt/homebrew/bin/ollama" : "",
  ].filter((candidate): candidate is string => Boolean(candidate));

  const existing = candidates.find(fileExists);
  return existing ?? "ollama";
}

async function pingOllama(baseUrl: string, fetchImpl: FetchLike, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${baseUrl}/api/tags`, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForOllama(
  baseUrl: string,
  fetchImpl: FetchLike,
  timeoutMs: number,
  sleepImpl: (ms: number) => Promise<void>,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now());
    if (await pingOllama(baseUrl, fetchImpl, Math.min(1_500, remaining))) return true;
    await sleepImpl(Math.min(500, Math.max(50, deadline - Date.now())));
  }
  return false;
}

export async function ensureOllamaServerRunning(
  options: EnsureOllamaServerOptions,
): Promise<OllamaStartupResult> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const spawnImpl = options.spawnImpl ?? spawn;
  const sleepImpl = options.sleepImpl ?? sleep;
  const startupTimeoutMs = Math.max(1_000, options.startupTimeoutMs ?? 20_000);

  if (await pingOllama(baseUrl, fetchImpl, 1_500)) {
    return {
      status: "already_running",
      baseUrl,
      message: `Ollama is already reachable at ${baseUrl}.`,
    };
  }

  if (!options.autoStart) {
    return {
      status: "disabled",
      baseUrl,
      message: "Ollama auto-start is disabled.",
    };
  }

  if (!isLoopbackOllamaUrl(baseUrl)) {
    return {
      status: "skipped_non_loopback",
      baseUrl,
      message: `Ollama auto-start is skipped for non-loopback URL ${baseUrl}.`,
    };
  }

  const command = resolveOllamaCommand(options.ollamaPath);
  let child: ChildProcess;
  try {
    child = spawnImpl(command, ["serve"], {
      cwd: os.homedir(),
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to start Ollama with ${command} serve: ${message}`);
  }
  const spawnFailure: { error: Error | null } = { error: null };
  child.once("error", (err) => {
    spawnFailure.error = err;
  });
  child.unref();

  if (!(await waitForOllama(baseUrl, fetchImpl, startupTimeoutMs, sleepImpl))) {
    if (spawnFailure.error) {
      throw new Error(`Failed to start Ollama with ${command} serve: ${spawnFailure.error.message}`);
    }
    throw new Error(`Started ${command} serve, but Ollama did not become reachable at ${baseUrl}.`);
  }

  return {
    status: "started",
    baseUrl,
    command,
    message: `Started Ollama with ${command} serve and verified ${baseUrl}.`,
  };
}
