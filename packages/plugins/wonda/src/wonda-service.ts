import { spawn } from "node:child_process";
import { access, constants } from "node:fs/promises";
import { delimiter, join } from "node:path";
import type {
  WondaAvailability,
  WondaEnv,
  WondaRunOptions,
  WondaRunResult,
} from "./types.js";

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const SETUP_INSTRUCTIONS = [
  "Wonda CLI is not installed on this host.",
  "Install it globally and make sure it is on the PATH used by the server:",
  "",
  "  npm install -g @degausai/wonda",
  "",
  "Then confirm the binary is reachable:",
  "",
  "  which wonda",
  "  wonda --version",
  "",
  "Finally set the integration credentials in the server environment:",
  "",
  "  WONDA_API_KEY=...   # from https://wonda.sh",
  "  OPENAI_API_KEY=...  # used by Wonda model providers",
].join("\n");

async function pathExists(p: string): Promise<boolean> {
  try {
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveBinary(binary: string): Promise<string | undefined> {
  if (binary.includes("/") || binary.includes("\\")) {
    return (await pathExists(binary)) ? binary : undefined;
  }
  const pathEnv = process.env.PATH ?? "";
  for (const dir of pathEnv.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    if (await pathExists(candidate)) return candidate;
  }
  return undefined;
}

/**
 * WondaService wraps the installed `wonda` CLI.
 *
 * Rules:
 * - NEVER import `@degausai/wonda` as a module — always spawn the CLI.
 * - Always run the binary with a bounded timeout.
 * - Pass credentials only through the child env, never on argv.
 */
export class WondaService {
  private readonly binary: string;
  private readonly baseEnv: WondaEnv;
  private cachedBinaryPath: string | undefined;
  private cachedAvailability: WondaAvailability | undefined;

  constructor(options: { binary?: string; env?: WondaEnv } = {}) {
    this.binary = options.binary ?? "wonda";
    this.baseEnv = options.env ?? {};
  }

  async checkAvailability(forceRefresh = false): Promise<WondaAvailability> {
    if (!forceRefresh && this.cachedAvailability) {
      return this.cachedAvailability;
    }
    const binaryPath = await resolveBinary(this.binary);
    if (!binaryPath) {
      const missing: WondaAvailability = {
        installed: false,
        setupInstructions: SETUP_INSTRUCTIONS,
      };
      this.cachedAvailability = missing;
      return missing;
    }

    let version: string | undefined;
    try {
      const versionRun = await this.spawnRaw(binaryPath, ["--version"], {
        timeoutMs: 10_000,
      });
      if (versionRun.exitCode === 0) {
        version = versionRun.stdout.trim() || undefined;
      }
    } catch {
      // ignore — we still treat it as installed if the binary exists
    }

    const availability: WondaAvailability = {
      installed: true,
      binaryPath,
      version,
      setupInstructions: SETUP_INSTRUCTIONS,
    };
    this.cachedBinaryPath = binaryPath;
    this.cachedAvailability = availability;
    return availability;
  }

  /**
   * Run the CLI with structured arguments. Throws if the binary is missing.
   */
  async run(args: string[], options: WondaRunOptions = {}): Promise<WondaRunResult> {
    const availability = await this.checkAvailability();
    if (!availability.installed || !availability.binaryPath) {
      throw new WondaNotInstalledError(availability.setupInstructions);
    }
    return this.spawnRaw(availability.binaryPath, args, options);
  }

  /**
   * Run with `--output json` and parse the result on stdout.
   */
  async runJson<T = unknown>(args: string[], options: WondaRunOptions = {}): Promise<T> {
    const result = await this.run([...args, "--output", "json"], options);
    if (result.exitCode !== 0) {
      throw new Error(
        `wonda exited with code ${result.exitCode}: ${result.stderr.trim() || result.stdout.trim() || "no output"}`,
      );
    }
    const trimmed = result.stdout.trim();
    if (!trimmed) {
      throw new Error("wonda produced no stdout output");
    }
    try {
      return JSON.parse(trimmed) as T;
    } catch {
      const lastBrace = trimmed.lastIndexOf("{");
      if (lastBrace > 0) {
        try {
          return JSON.parse(trimmed.slice(lastBrace)) as T;
        } catch {
          // fall through
        }
      }
      throw new Error(`wonda stdout was not valid JSON: ${trimmed.slice(0, 200)}`);
    }
  }

  private spawnRaw(
    binaryPath: string,
    args: string[],
    options: WondaRunOptions,
  ): Promise<WondaRunResult> {
    const start = Date.now();
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      ...this.baseEnv,
      ...(options.env ?? {}),
    } as NodeJS.ProcessEnv;

    return new Promise((resolve, reject) => {
      const child = spawn(binaryPath, args, {
        cwd: options.cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });

      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];

      child.stdout?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stdoutChunks.push(text);
        options.onStdout?.(text);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        stderrChunks.push(text);
        options.onStderr?.(text);
      });

      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
      }, timeoutMs);

      const onAbort = () => {
        child.kill("SIGTERM");
      };
      options.signal?.addEventListener("abort", onAbort, { once: true });

      child.once("error", (err) => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        reject(err);
      });

      child.once("close", (code) => {
        clearTimeout(timer);
        options.signal?.removeEventListener("abort", onAbort);
        resolve({
          exitCode: code,
          stdout: stdoutChunks.join(""),
          stderr: stderrChunks.join(""),
          durationMs: Date.now() - start,
        });
      });
    });
  }

  getCachedBinaryPath(): string | undefined {
    return this.cachedBinaryPath;
  }
}

export class WondaNotInstalledError extends Error {
  readonly setupInstructions: string;
  constructor(setupInstructions: string) {
    super("wonda CLI is not installed");
    this.name = "WondaNotInstalledError";
    this.setupInstructions = setupInstructions;
  }
}

export { SETUP_INSTRUCTIONS as WONDA_SETUP_INSTRUCTIONS };
