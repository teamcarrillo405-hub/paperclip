import {
  definePlugin,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";
import { AiderService } from "./aider-service.js";
import {
  AiderExecutionError,
  AiderNotInstalledError,
} from "./types.js";

function toolError(err: unknown): ToolResult {
  if (err instanceof AiderNotInstalledError) {
    return {
      error: `${err.message} (run: pip install aider-chat)`,
    };
  }
  if (err instanceof AiderExecutionError) {
    return { error: `Aider error (exit ${err.exitCode}): ${err.message}` };
  }
  if (err instanceof Error) {
    return { error: `Aider plugin error: ${err.message}` };
  }
  return { error: `Aider plugin error: ${String(err)}` };
}

function extractString(params: unknown, key: string): string | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function extractNumber(params: unknown, key: string): number | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function extractStringArray(params: unknown, key: string): string[] {
  if (!params || typeof params !== "object") return [];
  const raw = (params as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.length > 0);
}

function buildService(_ctx: PluginContext): AiderService {
  return new AiderService({
    cwd: process.env.AIDER_CWD,
    defaultModel: process.env.AIDER_MODEL,
  });
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Aider plugin setup starting", {
      model: process.env.AIDER_MODEL ?? "claude-3-5-sonnet-20241022",
    });

    ctx.tools.register(
      TOOL_NAMES.fixBug,
      {
        displayName: "Aider: Fix Bug",
        description: "Describe a bug and the files involved; Aider produces a fix and returns the diff.",
        parametersSchema: {
          type: "object",
          properties: {
            description: { type: "string" },
            files: { type: "array", items: { type: "string" } },
          },
          required: ["description", "files"],
        },
      },
      async (params) => {
        try {
          const description = extractString(params, "description") ?? "";
          const files = extractStringArray(params, "files");
          if (!description || files.length === 0) {
            return { error: "description and files are required" };
          }
          const result = await buildService(ctx).fixBug({ description, files });
          return { content: "Fix complete.", data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.addFeature,
      {
        displayName: "Aider: Add Feature",
        description: "Add a feature to the specified files.",
        parametersSchema: {
          type: "object",
          properties: {
            description: { type: "string" },
            files: { type: "array", items: { type: "string" } },
          },
          required: ["description", "files"],
        },
      },
      async (params) => {
        try {
          const description = extractString(params, "description") ?? "";
          const files = extractStringArray(params, "files");
          if (!description || files.length === 0) {
            return { error: "description and files are required" };
          }
          const result = await buildService(ctx).addFeature({ description, files });
          return { content: "Feature added.", data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.writeTests,
      {
        displayName: "Aider: Write Tests",
        description: "Generate tests for the specified files.",
        parametersSchema: {
          type: "object",
          properties: { files: { type: "array", items: { type: "string" } } },
          required: ["files"],
        },
      },
      async (params) => {
        try {
          const files = extractStringArray(params, "files");
          if (files.length === 0) return { error: "files are required" };
          const result = await buildService(ctx).writeTests({ files });
          return { content: "Tests written.", data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.refactorCode,
      {
        displayName: "Aider: Refactor Code",
        description: "Refactor the provided files per the given instructions.",
        parametersSchema: {
          type: "object",
          properties: {
            files: { type: "array", items: { type: "string" } },
            instructions: { type: "string" },
          },
          required: ["files", "instructions"],
        },
      },
      async (params) => {
        try {
          const files = extractStringArray(params, "files");
          const instructions = extractString(params, "instructions") ?? "";
          if (files.length === 0 || !instructions) {
            return { error: "files and instructions are required" };
          }
          const result = await buildService(ctx).refactorCode({ files, instructions });
          return { content: "Refactor complete.", data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.createBranchAndFix,
      {
        displayName: "Aider: Create Branch & Fix",
        description: "Create a new git branch, apply a fix with Aider, and commit the result.",
        parametersSchema: {
          type: "object",
          properties: {
            issueDescription: { type: "string" },
            files: { type: "array", items: { type: "string" } },
          },
          required: ["issueDescription"],
        },
      },
      async (params) => {
        try {
          const issueDescription = extractString(params, "issueDescription") ?? "";
          const files = extractStringArray(params, "files");
          if (!issueDescription) return { error: "issueDescription is required" };
          const result = await buildService(ctx).createBranchAndFix({
            issueDescription,
            files,
          });
          return { content: `Branch ${result.branchName} created and committed.`, data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getGitDiff,
      {
        displayName: "Aider: Get Git Diff",
        description: "Return the current uncommitted working-tree diff.",
        parametersSchema: { type: "object", properties: {} },
      },
      async () => {
        try {
          const diff = buildService(ctx).getGitDiff();
          return { content: diff || "(no changes)", data: { diff } };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listRecentCommits,
      {
        displayName: "Aider: List Recent Commits",
        description: "List the N most recent git commits (default 10).",
        parametersSchema: {
          type: "object",
          properties: { limit: { type: "number" } },
        },
      },
      async (params) => {
        try {
          const limit = extractNumber(params, "limit") ?? 10;
          const commits = buildService(ctx).listRecentCommits(limit);
          return { content: `Found ${commits.length} commits.`, data: commits };
        } catch (err) {
          return toolError(err);
        }
      },
    );
  },
});

export default plugin;
