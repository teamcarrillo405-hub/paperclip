import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.goose";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  runTask: "goose_run_task",
  runTaskFromTemplate: "goose_run_task_from_template",
  getTaskStatus: "goose_get_task_status",
  getTaskOutput: "goose_get_task_output",
  cancelTask: "goose_cancel_task",
  listTasks: "goose_list_tasks",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Goose CLI",
  description:
    "Run autonomous multi-step Goose CLI (Block/Square) agent tasks from Paperclip agents.",
  author: "Avero AI",
  categories: ["automation"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.runTask,
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
    {
      name: TOOL_NAMES.runTaskFromTemplate,
      displayName: "Goose: Run Task From Template",
      description:
        "Kick off a Goose task from a bundled template (daily-operations, weekly-reporting, customer-followup) with optional {{variable}} substitutions.",
      parametersSchema: {
        type: "object",
        properties: {
          templateName: {
            type: "string",
            enum: [
              "daily-operations",
              "weekly-reporting",
              "customer-followup",
            ],
          },
          variables: {
            type: "object",
            additionalProperties: { type: "string" },
          },
        },
        required: ["templateName"],
      },
    },
    {
      name: TOOL_NAMES.getTaskStatus,
      displayName: "Goose: Get Task Status",
      description:
        "Fetch the status (running/completed/failed/cancelled) of a Goose task by ID.",
      parametersSchema: {
        type: "object",
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
    {
      name: TOOL_NAMES.getTaskOutput,
      displayName: "Goose: Get Task Output",
      description: "Fetch the captured stdout/stderr output of a Goose task by ID.",
      parametersSchema: {
        type: "object",
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
    {
      name: TOOL_NAMES.cancelTask,
      displayName: "Goose: Cancel Task",
      description: "Cancel a running Goose task by ID (SIGTERM to the child process).",
      parametersSchema: {
        type: "object",
        properties: { taskId: { type: "string" } },
        required: ["taskId"],
      },
    },
    {
      name: TOOL_NAMES.listTasks,
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
  ],
};

export default manifest;
