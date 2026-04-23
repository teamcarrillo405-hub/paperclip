import { execSync } from "node:child_process";
import { mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import {
  WondaNotInstalledError,
  WondaService,
  WONDA_SETUP_INSTRUCTIONS,
} from "./wonda-service.js";
import type {
  WondaAssetRef,
  WondaEnv,
  WondaRunOptions,
  WondaRunResult,
} from "./types.js";

export interface WondaExecutorOptions {
  service?: WondaService;
  env?: WondaEnv;
  binary?: string;
}

export interface WondaSkillRunInput {
  skillMarkdown: string;
  variables?: Record<string, string | string[] | undefined>;
  env?: WondaEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface WondaSkillRunResult extends WondaRunResult {
  outputDir: string;
  skillFile: string;
  assets: WondaAssetRef[];
  json?: unknown;
}

const ASSET_EXT_MAP: Record<string, WondaAssetRef["kind"]> = {
  ".png": "image",
  ".jpg": "image",
  ".jpeg": "image",
  ".gif": "image",
  ".webp": "image",
  ".svg": "image",
  ".mp4": "video",
  ".mov": "video",
  ".webm": "video",
  ".mp3": "audio",
  ".wav": "audio",
  ".m4a": "audio",
  ".ogg": "audio",
  ".txt": "text",
  ".md": "text",
  ".json": "text",
};

/**
 * Substitute `{placeholder}` tokens inside a skill markdown body.
 *
 * Arrays join with comma+space. Undefined values become an empty string.
 */
export function renderSkillMarkdown(
  skill: string,
  variables: Record<string, string | string[] | undefined> = {},
): string {
  return skill.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = variables[key];
    if (value === undefined) return "";
    return Array.isArray(value) ? value.join(", ") : String(value);
  });
}

async function walkAssets(dir: string, acc: WondaAssetRef[] = []): Promise<WondaAssetRef[]> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch {
    return acc;
  }
  for (const name of entries) {
    const full = join(dir, name);
    const info = await stat(full).catch(() => null);
    if (!info) continue;
    if (info.isDirectory()) {
      await walkAssets(full, acc);
      continue;
    }
    const ext = extname(name).toLowerCase();
    const kind = ASSET_EXT_MAP[ext];
    if (!kind) continue;
    acc.push({
      kind,
      url: `file://${full}`,
      caption: name,
    });
  }
  return acc;
}

/**
 * Wonda executor — spawns the `wonda` CLI as a subprocess and collects assets.
 *
 * IMPORTANT: NEVER import `@degausai/wonda` as a module. Always shell out so
 * the CLI's own sandboxing / provider config is used.
 */
export class WondaExecutor {
  private readonly service: WondaService;

  constructor(options: WondaExecutorOptions = {}) {
    this.service =
      options.service ??
      new WondaService({ binary: options.binary, env: options.env });
  }

  /**
   * Cheap synchronous probe for the CLI. Returns true if `which wonda` succeeds.
   * Use `service.checkAvailability()` for the richer async form.
   */
  static isInstalledSync(binary = "wonda"): boolean {
    try {
      execSync(`which ${binary}`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  }

  /** Exposed for callers that want the availability/setup instructions. */
  getService(): WondaService {
    return this.service;
  }

  /**
   * Run an inline markdown skill against the installed wonda CLI.
   *
   * Writes the (rendered) skill to a temporary file, creates an output dir,
   * and runs `wonda run --skill <file> --output <dir>`. Returns stdout/stderr,
   * the output dir, and a scan of any assets Wonda wrote to that dir.
   */
  async runSkill(input: WondaSkillRunInput): Promise<WondaSkillRunResult> {
    const availability = await this.service.checkAvailability();
    if (!availability.installed) {
      throw new WondaNotInstalledError(availability.setupInstructions);
    }

    const workDir = await mkdtemp(join(tmpdir(), "wonda-run-"));
    const outputDir = join(workDir, "output");
    const skillFile = join(workDir, "skill.md");
    const rendered = renderSkillMarkdown(input.skillMarkdown, input.variables);
    await writeFile(skillFile, rendered, "utf8");

    const runOptions: WondaRunOptions = {
      env: input.env,
      timeoutMs: input.timeoutMs,
      signal: input.signal,
    };

    const args = [
      "run",
      "--skill",
      skillFile,
      "--output",
      outputDir,
      "--format",
      "json",
    ];
    const result = await this.service.run(args, runOptions);
    const assets = await walkAssets(outputDir);

    let json: unknown;
    const candidatePaths = [
      join(outputDir, "result.json"),
      join(outputDir, "output.json"),
    ];
    for (const p of candidatePaths) {
      try {
        const raw = await readFile(p, "utf8");
        json = JSON.parse(raw);
        break;
      } catch {
        // ignore
      }
    }
    if (json === undefined && result.stdout.trim().startsWith("{")) {
      try {
        json = JSON.parse(result.stdout);
      } catch {
        // ignore parse failures — json stays undefined
      }
    }

    return {
      ...result,
      outputDir,
      skillFile,
      assets,
      json,
    };
  }

  /**
   * Invoke a single wonda subcommand (e.g. `image`, `video`, `audio`).
   *
   * Callers are responsible for parsing subcommand-specific output; this is a
   * thin wrapper that enforces the "subprocess only" rule.
   */
  async invoke(args: string[], options: WondaRunOptions = {}): Promise<WondaRunResult> {
    return this.service.run(args, options);
  }

  async generateImage(input: {
    description: string;
    style?: string;
    outputDir?: string;
    timeoutMs?: number;
  }): Promise<WondaSkillRunResult> {
    const skill = [
      "# Generate Product Image",
      "",
      `Generate a single high-quality product marketing image.`,
      "",
      `Description: ${input.description}`,
      input.style ? `Style: ${input.style}` : "",
      "",
      "Output exactly one image asset.",
    ]
      .filter(Boolean)
      .join("\n");

    return this.runSkill({
      skillMarkdown: skill,
      timeoutMs: input.timeoutMs,
    });
  }

  async generateVideo(input: {
    script: string;
    voiceStyle?: string;
    timeoutMs?: number;
  }): Promise<WondaSkillRunResult> {
    const skill = [
      "# Generate Promo Video",
      "",
      "Produce a short vertical promo video (Kling + Sora) with voiceover.",
      "",
      `Script: ${input.script}`,
      input.voiceStyle ? `Voice style: ${input.voiceStyle}` : "",
      "",
      "Output a single mp4 file and the rendered voice track.",
    ]
      .filter(Boolean)
      .join("\n");

    return this.runSkill({
      skillMarkdown: skill,
      timeoutMs: input.timeoutMs,
    });
  }

  async generateAudio(input: {
    description: string;
    timeoutMs?: number;
  }): Promise<WondaSkillRunResult> {
    const skill = [
      "# Generate Audio Jingle",
      "",
      "Use Suno to produce a short audio jingle suitable for social ads.",
      "",
      `Description: ${input.description}`,
      "",
      "Output a single audio file (mp3 or wav).",
    ].join("\n");

    return this.runSkill({
      skillMarkdown: skill,
      timeoutMs: input.timeoutMs,
    });
  }
}

export { WondaNotInstalledError, WONDA_SETUP_INSTRUCTIONS };
