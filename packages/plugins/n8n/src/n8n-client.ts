/**
 * Thin wrapper around the n8n REST API.
 *
 * n8n runs as a Docker sidecar in our deployment. Its REST API is authenticated
 * with an API key sent as `X-N8N-API-KEY`. Webhook calls are made without the
 * API key (they are authenticated by the webhook path itself).
 *
 * Connection failures are surfaced as N8nNotConnectedError so callers can
 * render a friendly "not connected" state in the UI.
 */

import type {
  N8nExecution,
  N8nExecutionListResponse,
  N8nWorkflow,
  N8nWorkflowListResponse,
} from "./types.js";

export const DEFAULT_N8N_INTERNAL_URL = "http://n8n:5678";

export class N8nNotConnectedError extends Error {
  readonly cause?: unknown;
  constructor(message = "n8n is not connected. Start the n8n Docker sidecar and set N8N_API_KEY.", cause?: unknown) {
    super(message);
    this.name = "N8nNotConnectedError";
    this.cause = cause;
  }
}

export class N8nApiError extends Error {
  readonly status: number;
  readonly details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "N8nApiError";
    this.status = status;
    this.details = details;
  }
}

export interface N8nClientOptions {
  /** Base URL of the n8n REST API, e.g. "http://n8n:5678" */
  baseUrl?: string;
  /** API key sent as X-N8N-API-KEY */
  apiKey?: string;
  /** Override for tests */
  fetchImpl?: typeof fetch;
}

export interface N8nClient {
  listWorkflows(): Promise<N8nWorkflow[]>;
  getWorkflow(id: string): Promise<N8nWorkflow>;
  createWorkflow(payload: Partial<N8nWorkflow> & { name: string }): Promise<N8nWorkflow>;
  activateWorkflow(id: string): Promise<N8nWorkflow>;
  deactivateWorkflow(id: string): Promise<N8nWorkflow>;
  getExecutions(workflowId: string, limit?: number): Promise<N8nExecution[]>;
  /** Send JSON to a webhook URL. Does NOT use the X-N8N-API-KEY header. */
  triggerWebhook(url: string, data?: unknown): Promise<unknown>;
  /** Is the API reachable and authenticated? */
  ping(): Promise<boolean>;
}

function resolveBaseUrl(opts: N8nClientOptions): string {
  const raw = opts.baseUrl ?? process.env.N8N_INTERNAL_URL ?? DEFAULT_N8N_INTERNAL_URL;
  return raw.replace(/\/+$/, "");
}

function resolveApiKey(opts: N8nClientOptions): string | undefined {
  return opts.apiKey ?? process.env.N8N_API_KEY;
}

export function createN8nClient(opts: N8nClientOptions = {}): N8nClient {
  const baseUrl = resolveBaseUrl(opts);
  const apiKey = resolveApiKey(opts);
  const doFetch = opts.fetchImpl ?? fetch;

  async function request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    if (!apiKey) {
      throw new N8nNotConnectedError("N8N_API_KEY is not set.");
    }
    const url = new URL(`${baseUrl}/api/v1${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
      }
    }
    const headers: Record<string, string> = {
      "X-N8N-API-KEY": apiKey,
      "Accept": "application/json",
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let res: Response;
    try {
      res = await doFetch(url.toString(), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      throw new N8nNotConnectedError(
        `Could not reach n8n at ${baseUrl}. Is the Docker sidecar running?`,
        err,
      );
    }

    if (!res.ok) {
      let details: unknown = undefined;
      try { details = await res.json(); } catch { /* ignore */ }
      const message = typeof (details as { message?: unknown } | undefined)?.message === "string"
        ? (details as { message: string }).message
        : `n8n API ${method} ${path} failed with ${res.status}`;
      throw new N8nApiError(message, res.status, details);
    }
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
  }

  return {
    async listWorkflows() {
      const resp = await request<N8nWorkflowListResponse>("GET", "/workflows");
      return resp.data ?? [];
    },

    async getWorkflow(id: string) {
      return request<N8nWorkflow>("GET", `/workflows/${encodeURIComponent(id)}`);
    },

    async createWorkflow(payload) {
      return request<N8nWorkflow>("POST", "/workflows", payload);
    },

    async activateWorkflow(id: string) {
      return request<N8nWorkflow>("POST", `/workflows/${encodeURIComponent(id)}/activate`);
    },

    async deactivateWorkflow(id: string) {
      return request<N8nWorkflow>("POST", `/workflows/${encodeURIComponent(id)}/deactivate`);
    },

    async getExecutions(workflowId: string, limit = 20) {
      const resp = await request<N8nExecutionListResponse>("GET", "/executions", undefined, {
        workflowId,
        limit,
      });
      return resp.data ?? [];
    },

    async triggerWebhook(url: string, data?: unknown) {
      let res: Response;
      try {
        res = await doFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: data === undefined ? "{}" : JSON.stringify(data),
        });
      } catch (err) {
        throw new N8nNotConnectedError(`Could not reach n8n webhook at ${url}.`, err);
      }
      if (!res.ok) {
        let details: unknown = undefined;
        try { details = await res.json(); } catch { /* ignore */ }
        throw new N8nApiError(
          `n8n webhook POST failed with ${res.status}`,
          res.status,
          details,
        );
      }
      const text = await res.text();
      if (!text) return null;
      try { return JSON.parse(text); } catch { return text; }
    },

    async ping() {
      if (!apiKey) return false;
      try {
        await request<N8nWorkflowListResponse>("GET", "/workflows", undefined, { limit: 1 });
        return true;
      } catch {
        return false;
      }
    },
  };
}
