/**
 * Higher-level n8n operations used by both the server routes and the plugin
 * worker. Wraps the raw N8nClient with template loading, summary shaping, and
 * webhook-URL derivation.
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createN8nClient,
  N8nNotConnectedError,
  type N8nClient,
  type N8nClientOptions,
} from "./n8n-client.js";
import type {
  N8nExecution,
  N8nExecutionStatus,
  N8nExecutionSummary,
  N8nWorkflow,
  N8nWorkflowSummary,
  WorkflowTemplateConfig,
  WorkflowTemplateName,
} from "./types.js";

const TEMPLATE_NAMES: readonly WorkflowTemplateName[] = [
  "lead-nurture",
  "invoice-reminder",
  "review-request",
] as const;

export function isWorkflowTemplateName(name: string): name is WorkflowTemplateName {
  return (TEMPLATE_NAMES as readonly string[]).includes(name);
}

function templatesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "workflow-templates");
}

function applyVariables(value: string, variables: Record<string, string>): string {
  return value.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, key: string) => {
    if (Object.prototype.hasOwnProperty.call(variables, key)) {
      return variables[key]!;
    }
    return match;
  });
}

function substituteVariables(node: unknown, variables: Record<string, string>): unknown {
  if (typeof node === "string") return applyVariables(node, variables);
  if (Array.isArray(node)) return node.map((item) => substituteVariables(item, variables));
  if (node && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      out[k] = substituteVariables(v, variables);
    }
    return out;
  }
  return node;
}

export async function loadTemplate(name: WorkflowTemplateName): Promise<Record<string, unknown>> {
  const path = join(templatesDir(), `${name}.json`);
  const raw = await readFile(path, "utf8");
  return JSON.parse(raw) as Record<string, unknown>;
}

function normalizeExecutionStatus(raw: N8nExecution): N8nExecutionStatus {
  const status = typeof raw.status === "string" ? raw.status.toLowerCase() : undefined;
  if (status === "success" || status === "error" || status === "running"
    || status === "waiting" || status === "canceled" || status === "crashed") {
    return status;
  }
  if (raw.finished && !status) return "success";
  return "unknown";
}

function toExecutionSummary(raw: N8nExecution): N8nExecutionSummary {
  const startedMs = raw.startedAt ? Date.parse(raw.startedAt) : Number.NaN;
  const stoppedMs = raw.stoppedAt ? Date.parse(raw.stoppedAt) : Number.NaN;
  const durationMs = Number.isFinite(startedMs) && Number.isFinite(stoppedMs)
    ? Math.max(0, stoppedMs - startedMs)
    : undefined;
  return {
    id: raw.id,
    workflowId: raw.workflowId,
    status: normalizeExecutionStatus(raw),
    startedAt: raw.startedAt,
    stoppedAt: raw.stoppedAt,
    durationMs,
  };
}

function toWorkflowSummary(raw: N8nWorkflow, lastExecution?: N8nExecutionSummary | null): N8nWorkflowSummary {
  return {
    id: raw.id,
    name: raw.name,
    active: Boolean(raw.active),
    tags: Array.isArray(raw.tags) ? raw.tags.map((t) => t.name) : [],
    updatedAt: raw.updatedAt,
    lastExecution: lastExecution ?? undefined,
  };
}

export interface N8nStatus {
  connected: boolean;
  workflowCount: number;
  message?: string;
  baseUrl: string;
}

export class N8nService {
  private readonly client: N8nClient;
  readonly baseUrl: string;

  constructor(options: N8nClientOptions = {}) {
    this.client = createN8nClient(options);
    this.baseUrl = (options.baseUrl ?? process.env.N8N_INTERNAL_URL ?? "http://n8n:5678").replace(/\/+$/, "");
  }

  /** Returns connection + workflow-count info without throwing. */
  async getStatus(): Promise<N8nStatus> {
    try {
      const workflows = await this.client.listWorkflows();
      return { connected: true, workflowCount: workflows.length, baseUrl: this.baseUrl };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { connected: false, workflowCount: 0, baseUrl: this.baseUrl, message };
    }
  }

  async listWorkflowsWithLastExecution(): Promise<N8nWorkflowSummary[]> {
    const workflows = await this.client.listWorkflows();
    const enriched = await Promise.all(workflows.map(async (wf) => {
      let lastExecution: N8nExecutionSummary | null = null;
      try {
        const execs = await this.client.getExecutions(wf.id, 1);
        const first = execs[0];
        if (first) lastExecution = toExecutionSummary(first);
      } catch {
        lastExecution = null;
      }
      return toWorkflowSummary(wf, lastExecution);
    }));
    return enriched;
  }

  async getWorkflow(id: string): Promise<N8nWorkflow> {
    return this.client.getWorkflow(id);
  }

  async getExecutions(workflowId: string, limit = 20): Promise<N8nExecutionSummary[]> {
    const raw = await this.client.getExecutions(workflowId, limit);
    return raw.map(toExecutionSummary);
  }

  async activateWorkflow(id: string): Promise<N8nWorkflowSummary> {
    const wf = await this.client.activateWorkflow(id);
    return toWorkflowSummary(wf);
  }

  async deactivateWorkflow(id: string): Promise<N8nWorkflowSummary> {
    const wf = await this.client.deactivateWorkflow(id);
    return toWorkflowSummary(wf);
  }

  async toggleWorkflow(id: string): Promise<N8nWorkflowSummary> {
    const current = await this.client.getWorkflow(id);
    return current.active ? this.deactivateWorkflow(id) : this.activateWorkflow(id);
  }

  /** Create a new workflow from a bundled JSON template. */
  async createFromTemplate(
    templateName: WorkflowTemplateName,
    config: WorkflowTemplateConfig = {},
  ): Promise<N8nWorkflowSummary> {
    const template = await loadTemplate(templateName);
    const variables = config.variables ?? {};
    const prepared = substituteVariables(template, variables) as Record<string, unknown>;
    if (config.name) prepared.name = config.name;
    const payload = {
      name: typeof prepared.name === "string" ? prepared.name : templateName,
      nodes: Array.isArray(prepared.nodes) ? prepared.nodes : [],
      connections: (prepared.connections as Record<string, unknown>) ?? {},
      settings: (prepared.settings as Record<string, unknown>) ?? {},
    };
    const created = await this.client.createWorkflow(payload);
    if (config.activate && created.id) {
      try { await this.client.activateWorkflow(created.id); } catch { /* surface elsewhere */ }
    }
    return toWorkflowSummary(created);
  }

  /** Look up the webhook URL for a workflow's first webhook node, if any. */
  async getWebhookUrl(workflowId: string): Promise<string | null> {
    const wf = await this.client.getWorkflow(workflowId);
    const nodes = wf.nodes ?? [];
    const webhookNode = nodes.find((n) => n.type === "n8n-nodes-base.webhook");
    if (!webhookNode) return null;
    const path = typeof webhookNode.parameters?.path === "string"
      ? (webhookNode.parameters.path as string)
      : webhookNode.webhookId;
    if (!path) return null;
    return `${this.baseUrl}/webhook/${encodeURIComponent(path)}`;
  }

  async triggerWorkflow(workflowId: string, data?: unknown): Promise<unknown> {
    const url = await this.getWebhookUrl(workflowId);
    if (!url) {
      throw new N8nNotConnectedError(
        `Workflow ${workflowId} has no webhook trigger node; cannot trigger by ID.`,
      );
    }
    return this.client.triggerWebhook(url, data);
  }

  async triggerWebhook(url: string, data?: unknown): Promise<unknown> {
    return this.client.triggerWebhook(url, data);
  }
}

export { N8nNotConnectedError, TEMPLATE_NAMES };
