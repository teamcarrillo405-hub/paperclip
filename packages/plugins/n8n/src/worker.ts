import {
  definePlugin,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import {
  N8nApiError,
  N8nNotConnectedError,
} from "./n8n-client.js";
import {
  N8nService,
  isWorkflowTemplateName,
} from "./n8n-service.js";
import { TOOL_NAMES } from "./manifest.js";
import type { WorkflowTemplateConfig, WorkflowTemplateName } from "./types.js";

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

function extractObject(params: unknown, key: string): Record<string, unknown> | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return undefined;
}

function extractBoolean(params: unknown, key: string): boolean | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

function toolError(err: unknown): ToolResult {
  if (err instanceof N8nNotConnectedError) return { error: err.message };
  if (err instanceof N8nApiError) return { error: err.message };
  if (err instanceof Error) return { error: `n8n plugin error: ${err.message}` };
  return { error: `n8n plugin error: ${String(err)}` };
}

function newService(): N8nService {
  return new N8nService();
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("n8n plugin setup starting", {
      baseUrl: process.env.N8N_INTERNAL_URL ?? "http://n8n:5678",
      hasApiKey: !!process.env.N8N_API_KEY,
    });

    ctx.tools.register(
      TOOL_NAMES.listWorkflows,
      {
        displayName: "n8n: List Workflows",
        description: "List all n8n workflows with active/inactive status.",
        parametersSchema: { type: "object", properties: {} },
      },
      async () => {
        try {
          const workflows = await newService().listWorkflowsWithLastExecution();
          return {
            content: `Found ${workflows.length} n8n workflows.`,
            data: workflows,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.triggerWorkflow,
      {
        displayName: "n8n: Trigger Workflow",
        description: "Trigger an n8n workflow by ID. Workflow must have a webhook trigger node.",
        parametersSchema: {
          type: "object",
          properties: {
            workflowId: { type: "string" },
            data: { type: "object" },
          },
          required: ["workflowId"],
        },
      },
      async (params) => {
        const workflowId = extractString(params, "workflowId");
        if (!workflowId) return { error: "`workflowId` is required" };
        try {
          const data = extractObject(params, "data");
          const result = await newService().triggerWorkflow(workflowId, data);
          return {
            content: `Triggered workflow ${workflowId}.`,
            data: result ?? null,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getWorkflowExecutions,
      {
        displayName: "n8n: Get Workflow Executions",
        description: "Fetch recent execution history for a specific workflow.",
        parametersSchema: {
          type: "object",
          properties: {
            workflowId: { type: "string" },
            limit: { type: "number" },
          },
          required: ["workflowId"],
        },
      },
      async (params) => {
        const workflowId = extractString(params, "workflowId");
        if (!workflowId) return { error: "`workflowId` is required" };
        try {
          const executions = await newService().getExecutions(workflowId, extractNumber(params, "limit"));
          return {
            content: `Fetched ${executions.length} executions for workflow ${workflowId}.`,
            data: executions,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.createWorkflowFromTemplate,
      {
        displayName: "n8n: Create Workflow from Template",
        description: "Deploy a bundled template as a new n8n workflow.",
        parametersSchema: {
          type: "object",
          properties: {
            templateName: { type: "string" },
            config: { type: "object" },
          },
          required: ["templateName"],
        },
      },
      async (params) => {
        const templateName = extractString(params, "templateName");
        if (!templateName || !isWorkflowTemplateName(templateName)) {
          return { error: "`templateName` must be one of: lead-nurture, invoice-reminder, review-request" };
        }
        const configObj = extractObject(params, "config");
        const config: WorkflowTemplateConfig = {
          name: configObj ? extractString(configObj, "name") : undefined,
          variables: configObj && typeof configObj.variables === "object" && configObj.variables
            ? Object.fromEntries(
                Object.entries(configObj.variables as Record<string, unknown>).filter(
                  ([, v]) => typeof v === "string",
                ) as Array<[string, string]>,
              )
            : undefined,
          activate: configObj ? extractBoolean(configObj, "activate") : undefined,
        };
        try {
          const summary = await newService().createFromTemplate(
            templateName as WorkflowTemplateName,
            config,
          );
          return {
            content: `Created workflow "${summary.name}" (${summary.id}) from template ${templateName}.`,
            data: summary,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.enableWorkflow,
      {
        displayName: "n8n: Enable Workflow",
        description: "Activate an n8n workflow by ID.",
        parametersSchema: {
          type: "object",
          properties: { workflowId: { type: "string" } },
          required: ["workflowId"],
        },
      },
      async (params) => {
        const workflowId = extractString(params, "workflowId");
        if (!workflowId) return { error: "`workflowId` is required" };
        try {
          const summary = await newService().activateWorkflow(workflowId);
          return { content: `Activated workflow ${summary.name}.`, data: summary };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.disableWorkflow,
      {
        displayName: "n8n: Disable Workflow",
        description: "Deactivate an n8n workflow by ID.",
        parametersSchema: {
          type: "object",
          properties: { workflowId: { type: "string" } },
          required: ["workflowId"],
        },
      },
      async (params) => {
        const workflowId = extractString(params, "workflowId");
        if (!workflowId) return { error: "`workflowId` is required" };
        try {
          const summary = await newService().deactivateWorkflow(workflowId);
          return { content: `Deactivated workflow ${summary.name}.`, data: summary };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getWorkflowStatus,
      {
        displayName: "n8n: Get Workflow Status",
        description: "Fetch a workflow's active/inactive state and most recent execution.",
        parametersSchema: {
          type: "object",
          properties: { workflowId: { type: "string" } },
          required: ["workflowId"],
        },
      },
      async (params) => {
        const workflowId = extractString(params, "workflowId");
        if (!workflowId) return { error: "`workflowId` is required" };
        try {
          const service = newService();
          const workflow = await service.getWorkflow(workflowId);
          const execs = await service.getExecutions(workflowId, 1);
          const summary = {
            id: workflow.id,
            name: workflow.name,
            active: Boolean(workflow.active),
            lastExecution: execs[0] ?? null,
          };
          return {
            content: `Workflow ${workflow.name} is ${workflow.active ? "active" : "inactive"}.`,
            data: summary,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.sendToWorkflow,
      {
        displayName: "n8n: Send to Workflow Webhook",
        description: "Send JSON data to an arbitrary n8n webhook URL.",
        parametersSchema: {
          type: "object",
          properties: {
            webhookUrl: { type: "string" },
            data: { type: "object" },
          },
          required: ["webhookUrl"],
        },
      },
      async (params) => {
        const webhookUrl = extractString(params, "webhookUrl");
        if (!webhookUrl) return { error: "`webhookUrl` is required" };
        try {
          const data = extractObject(params, "data");
          const result = await newService().triggerWebhook(webhookUrl, data);
          return { content: `Posted to webhook ${webhookUrl}.`, data: result ?? null };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.logger.info("n8n plugin setup complete");
  },

  async onHealth() {
    const hasApiKey = typeof process.env.N8N_API_KEY === "string" && process.env.N8N_API_KEY.length > 0;
    if (!hasApiKey) {
      return {
        status: "degraded",
        message: "N8N_API_KEY is not set — agent tools will return a not-connected error.",
      };
    }
    try {
      const status = await newService().getStatus();
      if (status.connected) {
        return { status: "ok", message: `n8n reachable at ${status.baseUrl} (${status.workflowCount} workflows).` };
      }
      return {
        status: "degraded",
        message: status.message ?? `n8n not reachable at ${status.baseUrl}.`,
      };
    } catch (err) {
      return {
        status: "degraded",
        message: err instanceof Error ? err.message : String(err),
      };
    }
  },
});

export default plugin;
