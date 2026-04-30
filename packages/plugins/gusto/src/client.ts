/**
 * Gusto Payroll API client for the Gusto plugin worker.
 *
 * Wraps native `fetch` with:
 *   - per-company token loading from the plugin state store,
 *   - automatic refresh when the access token is near expiry,
 *   - error wrapping that surfaces the upstream Gusto error message.
 *
 * Token storage layout (plugin state):
 *   scopeKind = "company"
 *   scopeId   = <paperclip companyId>
 *   namespace = "gusto"
 *   stateKey  = "oauth-token"
 *   value     = GustoToken
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import type {
  GustoToken,
  GustoEmployee,
  GustoPayroll,
  GustoCompanyInfo,
  GustoPaySchedule,
} from "./types.js";

export const TOKEN_NAMESPACE = "gusto";
export const TOKEN_STATE_KEY = "oauth-token";

/** How many milliseconds before expiry we proactively refresh. */
const REFRESH_BUFFER_MS = 60_000;

export class GustoNotConnectedError extends Error {
  constructor() {
    super("Gusto not connected for this company. Connect at Settings → Integrations.");
    this.name = "GustoNotConnectedError";
  }
}

export class GustoApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "GustoApiError";
    this.status = status;
    this.details = details;
  }
}

function gustoBaseUrl(): string {
  return process.env.GUSTO_SANDBOX === "true"
    ? "https://api.gusto-demo.com"
    : "https://api.gusto.com";
}

async function loadToken(ctx: PluginContext, companyId: string): Promise<GustoToken | null> {
  const value = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    namespace: TOKEN_NAMESPACE,
    stateKey: TOKEN_STATE_KEY,
  });
  if (!value || typeof value !== "object") return null;
  const token = value as Partial<GustoToken>;
  if (
    typeof token.accessToken !== "string"
    || typeof token.refreshToken !== "string"
    || typeof token.expiresAt !== "string"
    || typeof token.tokenType !== "string"
    || typeof token.gustoCompanyUuid !== "string"
  ) {
    return null;
  }
  return token as GustoToken;
}

async function saveToken(
  ctx: PluginContext,
  companyId: string,
  token: GustoToken,
): Promise<void> {
  await ctx.state.set(
    {
      scopeKind: "company",
      scopeId: companyId,
      namespace: TOKEN_NAMESPACE,
      stateKey: TOKEN_STATE_KEY,
    },
    token as unknown as Record<string, unknown>,
  );
}

function tokenNeedsRefresh(token: GustoToken): boolean {
  const expiresAt = Date.parse(token.expiresAt);
  return Number.isNaN(expiresAt) || Date.now() >= expiresAt - REFRESH_BUFFER_MS;
}

async function refreshToken(token: GustoToken): Promise<GustoToken> {
  const clientId = (process.env.GUSTO_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GUSTO_CLIENT_SECRET ?? "").trim();
  const redirectUri = (process.env.GUSTO_REDIRECT_URI ?? "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw new GustoNotConnectedError();
  }

  const res = await fetch(`${gustoBaseUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new GustoApiError(`Gusto token refresh failed (${res.status}): ${text}`, res.status);
  }

  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };

  return {
    ...token,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    tokenType: json.token_type ?? "Bearer",
    updatedAt: new Date().toISOString(),
  };
}

async function ensureFreshToken(ctx: PluginContext, companyId: string): Promise<GustoToken> {
  const token = await loadToken(ctx, companyId);
  if (!token) throw new GustoNotConnectedError();

  if (!tokenNeedsRefresh(token)) return token;

  try {
    const refreshed = await refreshToken(token);
    await saveToken(ctx, companyId, refreshed);
    return refreshed;
  } catch (err) {
    ctx.logger.error("Gusto token refresh failed", {
      companyId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new GustoNotConnectedError();
  }
}

async function gustoFetch<T>(
  ctx: PluginContext,
  companyId: string,
  urlPath: string,
): Promise<T> {
  const token = await ensureFreshToken(ctx, companyId);
  const url = `${gustoBaseUrl()}${urlPath}`;

  const res = await fetch(url, {
    headers: {
      Authorization: `${token.tokenType} ${token.accessToken}`,
      Accept: "application/json",
      "X-Gusto-API-Version": "2024-03-01",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    throw new GustoApiError(`Gusto API error (${res.status}): ${text}`, res.status, text);
  }
  return JSON.parse(text) as T;
}

/**
 * Create a per-company Gusto client bound to a PluginContext.
 * All methods handle token loading, refresh, and error wrapping.
 */
export function createGustoClient(ctx: PluginContext, companyId: string) {
  async function getGustoCompanyUuid(): Promise<string> {
    const token = await ensureFreshToken(ctx, companyId);
    return token.gustoCompanyUuid;
  }

  async function listEmployees(status?: "active" | "terminated"): Promise<GustoEmployee[]> {
    const uuid = await getGustoCompanyUuid();
    const path = `/v1/companies/${encodeURIComponent(uuid)}/employees`;
    const url = status ? `${path}?employment_status=${encodeURIComponent(status)}` : path;
    return gustoFetch<GustoEmployee[]>(ctx, companyId, url);
  }

  async function getEmployee(employeeUuid: string): Promise<GustoEmployee> {
    return gustoFetch<GustoEmployee>(
      ctx,
      companyId,
      `/v1/employees/${encodeURIComponent(employeeUuid)}`,
    );
  }

  async function listPayrolls(options?: { processed?: boolean; limit?: number }): Promise<GustoPayroll[]> {
    const uuid = await getGustoCompanyUuid();
    const params = new URLSearchParams();
    if (options?.processed !== undefined) {
      params.set("processed", String(options.processed));
    }
    const qs = params.toString();
    const path = `/v1/companies/${encodeURIComponent(uuid)}/payrolls${qs ? `?${qs}` : ""}`;
    const results = await gustoFetch<GustoPayroll[]>(ctx, companyId, path);
    if (options?.limit !== undefined && options.limit > 0) {
      return results.slice(0, options.limit);
    }
    return results;
  }

  async function getPayroll(payrollUuid: string): Promise<GustoPayroll> {
    const uuid = await getGustoCompanyUuid();
    return gustoFetch<GustoPayroll>(
      ctx,
      companyId,
      `/v1/companies/${encodeURIComponent(uuid)}/payrolls/${encodeURIComponent(payrollUuid)}`,
    );
  }

  async function getCompanyInfo(): Promise<GustoCompanyInfo> {
    const uuid = await getGustoCompanyUuid();
    return gustoFetch<GustoCompanyInfo>(
      ctx,
      companyId,
      `/v1/companies/${encodeURIComponent(uuid)}`,
    );
  }

  async function listPaySchedules(): Promise<GustoPaySchedule[]> {
    const uuid = await getGustoCompanyUuid();
    return gustoFetch<GustoPaySchedule[]>(
      ctx,
      companyId,
      `/v1/companies/${encodeURIComponent(uuid)}/pay_schedules`,
    );
  }

  return {
    listEmployees,
    getEmployee,
    listPayrolls,
    getPayroll,
    getCompanyInfo,
    listPaySchedules,
  };
}

export type GustoClient = ReturnType<typeof createGustoClient>;
