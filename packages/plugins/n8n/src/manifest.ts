import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.n8n";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listWorkflows: "n8n_list_workflows",
  triggerWorkflow: "n8n_trigger_workflow",
  getWorkflowExecutions: "n8n_get_workflow_executions",
  createWorkflowFromTemplate: "n8n_create_workflow_from_template",
  enableWorkflow: "n8n_enable_workflow",
  disableWorkflow: "n8n_disable_workflow",
  getWorkflowStatus: "n8n_get_workflow_status",
  sendToWorkflow: "n8n_send_to_workflow",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "n8n Automations",
  description:
    "Visual workflow automation via n8n (self-hosted Docker sidecar). Expose n8n workflows as agent tools.",
  author: "Avero AI",
  categories: ["automation", "connector"],
  capabilities: [
    "agent.tools.register",
    "http.outbound",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.listWorkflows,
      displayName: "n8n: List Workflows",
      description: "List all n8n workflows with active/inactive status.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.triggerWorkflow,
      displayName: "n8n: Trigger Workflow",
      description: "Trigger an n8n workflow by ID (workflow must have a webhook trigger node). Optional JSON data is sent as the request body.",
      parametersSchema: {
        type: "object",
        properties: {
          workflowId: { type: "string" },
          data: { type: "object" },
        },
        required: ["workflowId"],
      },
    },
    {
      name: TOOL_NAMES.getWorkflowExecutions,
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
    {
      name: TOOL_NAMES.createWorkflowFromTemplate,
      displayName: "n8n: Create Workflow from Template",
      description: "Deploy a bundled template (lead-nurture, invoice-reminder, review-request) as a new n8n workflow.",
      parametersSchema: {
        type: "object",
        properties: {
          templateName: { type: "string", enum: ["lead-nurture", "invoice-reminder", "review-request"] },
          config: {
            type: "object",
            properties: {
              name: { type: "string" },
              variables: { type: "object" },
              activate: { type: "boolean" },
            },
          },
        },
        required: ["templateName"],
      },
    },
    {
      name: TOOL_NAMES.enableWorkflow,
      displayName: "n8n: Enable Workflow",
      description: "Activate an n8n workflow by ID.",
      parametersSchema: {
        type: "object",
        properties: { workflowId: { type: "string" } },
        required: ["workflowId"],
      },
    },
    {
      name: TOOL_NAMES.disableWorkflow,
      displayName: "n8n: Disable Workflow",
      description: "Deactivate an n8n workflow by ID.",
      parametersSchema: {
        type: "object",
        properties: { workflowId: { type: "string" } },
        required: ["workflowId"],
      },
    },
    {
      name: TOOL_NAMES.getWorkflowStatus,
      displayName: "n8n: Get Workflow Status",
      description: "Fetch a workflow's active/inactive state and its most recent execution summary.",
      parametersSchema: {
        type: "object",
        properties: { workflowId: { type: "string" } },
        required: ["workflowId"],
      },
    },
    {
      name: TOOL_NAMES.sendToWorkflow,
      displayName: "n8n: Send to Workflow Webhook",
      description: "Send JSON data to an arbitrary n8n webhook URL (does not require knowing the workflow ID).",
      parametersSchema: {
        type: "object",
        properties: {
          webhookUrl: { type: "string" },
          data: { type: "object" },
        },
        required: ["webhookUrl"],
      },
    },
  ],
};

export default manifest;
