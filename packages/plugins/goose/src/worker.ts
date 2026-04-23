import {
  definePlugin,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";
import { GooseService } from "./goose-service.js";
import { GooseNotInstalledError } from "./goose-executor.js";
import {
  TASK_TEMPLATES,
  isTaskTemplateName,
  renderTemplate,
} from "./task-templates.js";
import type { GooseTaskStatus } from "./types.js";

function toolError(err: unknown): ToolResult {
  if (err instanceof GooseNotInstalledError) {
    return { error: err.message };
  }
  if (err instanceof Error) {
    return { error: `Goose plugin error: ${err.message}` };
  }
  return { error: `Goose plugin error: ${String(err)}` };
}

function extractString(params: unknown, key: string): string | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function extractStringMap(
  params: unknown,
  key: string,
): Record<string, string> | undefined {
  if (!params || typeof params !== "object") return undefined;
  const raw = (params as Record<string, unknown>)[key];
  if (!raw || typeof raw !== "object") return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

function resolveCompanyId(ctx: PluginContext): string {
  const fromCtx = (ctx as unknown as { companyId?: unknown }).companyId;
  if (typeof fromCtx === "string" && fromCtx.length > 0) return fromCtx;
  return process.env.PAPERCLIP_COMPANY_ID ?? "default";
}

const service = new GooseService({ binary: process.env.GOOSE_BIN });

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Goose plugin setup starting", {
      binary: process.env.GOOSE_BIN ?? "goose",
    });

    ctx.tools.register(
      TOOL_NAMES.runTask,
      {
        displayName: "Goose: Run Task",
        description:
          "Kick off a Goose CLI task with free-form instructions. Returns a taskId to poll for status/output.",
        parametersSchema: {
          type: "object",
          properties: {
            instructions: { type: "string" },
            context: { type: "string" },
          },
          required: ["instructions"],
        },
      },
      async (params) => {
        try {
          const instructions = extractString(params, "instructions");
          if (!instructions) return { error: "instructions is required" };
          const context = extractString(params, "context");
          const rec = await service.startTask({
            instructions,
            context,
            companyId: resolveCompanyId(ctx),
          });
          return { content: `Task ${rec.id} started.`, data: { taskId: rec.id, status: rec.status } };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.runTaskFromTemplate,
      {
        displayName: "Goose: Run Task From Template",
        description:
          "Kick off a Goose task from a bundled template (daily-operations, weekly-reporting, customer-followup) with optional {{variable}} substitutions.",
        parametersSchema: {
          type: "object",
          properties: {
            templateName: {
              type: "string",
              enum: ["daily-operations", "weekly-reporting", "customer-followup"],
            },
            variables: {
              type: "object",
              additionalProperties: { type: "string" },
            },
          },
          required: ["templateName"],
        },
      },
      async (params) => {
        try {
          const templateName = extractString(params, "templateName");
          if (!templateName || !isTaskTemplateName(templateName)) {
            return { error: "templateName must be one of: daily-operations, weekly-reporting, customer-followup" };
          }
          const variables = extractStringMap(params, "variables");
          const instructions = renderTemplate(templateName, variables);
          const rec = await service.startTask({
            instructions,
            companyId: resolveCompanyId(ctx),
            templateName,
          });
          return {
            content: `Task ${rec.id} started from template ${TASK_TEMPLATES[templateName].name}.`,
            data: { taskId: rec.id, status: rec.status, templateName },
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getTaskStatus,
      {
        displayName: "Goose: Get Task Status",
        description:
          "Fetch the status (running/completed/failed/cancelled) of a Goose task by ID.",
        parametersSchema: {
          type: "object",
          properties: { taskId: { type: "string" } },
          required: ["taskId"],
        },
      },
      async (params) => {
        try {
          const taskId = extractString(params, "taskId");
          if (!taskId) return { error: "taskId is required" };
          const rec = await service.getTask(taskId);
          if (!rec) return { error: `Task ${taskId} not found` };
          return { content: rec.status, data: { taskId, status: rec.status } };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getTaskOutput,
      {
        displayName: "Goose: Get Task Output",
        description: "Fetch the captured stdout/stderr output of a Goose task by ID.",
        parametersSchema: {
          type: "object",
          properties: { taskId: { type: "string" } },
          required: ["taskId"],
        },
      },
      async (params) => {
        try {
          const taskId = extractString(params, "taskId");
          if (!taskId) return { error: "taskId is required" };
          const output = await service.getOutput(taskId);
          if (output === null) return { error: `Task ${taskId} not found` };
          return { content: output, data: { taskId, output } };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.cancelTask,
      {
        displayName: "Goose: Cancel Task",
        description: "Cancel a running Goose task by ID (SIGTERM to the child process).",
        parametersSchema: {
          type: "object",
          properties: { taskId: { type: "string" } },
          required: ["taskId"],
        },
      },
      async (params) => {
        try {
          const taskId = extractString(params, "taskId");
          if (!taskId) return { error: "taskId is required" };
          const rec = await service.cancelTask(taskId);
          if (!rec) return { error: `Task ${taskId} not found` };
          return { content: `Task ${taskId} ${rec.status}.`, data: { taskId, status: rec.status } };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listTasks,
      {
        displayName: "Goose: List Tasks",
        description:
          "List recent Goose tasks for the current company, optionally filtered by status.",
        parametersSchema: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: ["running", "completed", "failed", "cancelled"],
            },
          },
        },
      },
      async (params) => {
        try {
          const statusStr = extractString(params, "status");
          const status =
            statusStr === "running" ||
            statusStr === "completed" ||
            statusStr === "failed" ||
            statusStr === "cancelled"
              ? (statusStr as GooseTaskStatus)
              : undefined;
          const rows = await service.listTasks(resolveCompanyId(ctx), {
            status,
            limit: 50,
          });
          return { content: `${rows.length} tasks.`, data: rows };
        } catch (err) {
          return toolError(err);
        }
      },
    );
  },
});

export default plugin;
