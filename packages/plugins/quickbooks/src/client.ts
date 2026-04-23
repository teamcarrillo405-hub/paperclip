/**
 * QuickBooks Online API client.
 *
 * Wraps native `fetch` with:
 *   - per-company token loading from the plugin state store,
 *   - automatic refresh when the access token is within the refresh buffer,
 *   - error wrapping that surfaces the upstream QuickBooks error message.
 *
 * Token storage layout (plugin state):
 *   scopeKind = "company"
 *   scopeId   = <paperclip companyId>
 *   namespace = "quickbooks"
 *   stateKey  = "oauth-token"
 *   value     = QuickBooksToken
 */

import type { PluginContext } from "@paperclipai/plugin-sdk";
import {
  refreshAccessToken,
  tokenNeedsRefresh,
} from "./auth.js";
import type { QuickBooksToken } from "./types.js";

export const TOKEN_NAMESPACE = "quickbooks";
export const TOKEN_STATE_KEY = "oauth-token";

export const QUICKBOOKS_PROD_BASE_URL = "https://quickbooks.api.intuit.com";
export const QUICKBOOKS_SANDBOX_BASE_URL = "https://sandbox-quickbooks.api.intuit.com";
export const QUICKBOOKS_MINOR_VERSION = "70";

export interface QuickBooksClientOptions {
  clientId: string;
  clientSecret: string;
  sandbox: boolean;
}

function baseUrl(sandbox: boolean): string {
  return sandbox ? QUICKBOOKS_SANDBOX_BASE_URL : QUICKBOOKS_PROD_BASE_URL;
}

export class QuickBooksNotConnectedError extends Error {
  constructor() {
    super("QuickBooks not connected for this company. Visit Settings > Integrations to connect.");
    this.name = "QuickBooksNotConnectedError";
  }
}

export class QuickBooksApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "QuickBooksApiError";
    this.status = status;
    this.details = details;
  }
}

async function loadToken(ctx: PluginContext, companyId: string): Promise<QuickBooksToken | null> {
  const value = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    namespace: TOKEN_NAMESPACE,
    stateKey: TOKEN_STATE_KEY,
  });
  if (!value || typeof value !== "object") return null;
  const token = value as Partial<QuickBooksToken>;
  if (
    typeof token.accessToken !== "string"
    || typeof token.refreshToken !== "string"
    || typeof token.realmId !== "string"
    || typeof token.expiresAt !== "string"
  ) {
    return null;
  }
  return token as QuickBooksToken;
}

async function saveToken(
  ctx: PluginContext,
  companyId: string,
  token: QuickBooksToken,
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

export async function deleteToken(ctx: PluginContext, companyId: string): Promise<void> {
  await ctx.state.delete({
    scopeKind: "company",
    scopeId: companyId,
    namespace: TOKEN_NAMESPACE,
    stateKey: TOKEN_STATE_KEY,
  });
}

/**
 * Resolve a valid access token for the given company, refreshing first if the
 * token is expired or within the refresh buffer.
 */
async function ensureFreshToken(
  ctx: PluginContext,
  companyId: string,
  opts: QuickBooksClientOptions,
): Promise<QuickBooksToken> {
  const token = await loadToken(ctx, companyId);
  if (!token) throw new QuickBooksNotConnectedError();

  if (!tokenNeedsRefresh(token)) return token;

  try {
    const refreshed = await refreshAccessToken({
      refreshToken: token.refreshToken,
      realmId: token.realmId,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
    });
    await saveToken(ctx, companyId, refreshed);
    return refreshed;
  } catch (err) {
    ctx.logger.error("QuickBooks token refresh failed", {
      companyId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw new QuickBooksNotConnectedError();
  }
}

export interface QuickBooksRequestOptions {
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Content-Type override — defaults to application/json. */
  contentType?: string;
}

function buildRequestUrl(
  base: string,
  realmId: string,
  pathname: string,
  query?: Record<string, string | number | undefined>,
): string {
  const trimmed = pathname.startsWith("/") ? pathname.slice(1) : pathname;
  const url = new URL(`${base}/v3/company/${realmId}/${trimmed}`);
  url.searchParams.set("minorversion", QUICKBOOKS_MINOR_VERSION);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined) continue;
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

function extractApiErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const fault = record.Fault as Record<string, unknown> | undefined;
    if (fault && Array.isArray(fault.Error) && fault.Error.length > 0) {
      const first = fault.Error[0] as Record<string, unknown>;
      const message = first.Message as string | undefined;
      const detail = first.Detail as string | undefined;
      const code = first.code as string | undefined;
      return [
        `QuickBooks API error (${status}${code ? ` / code ${code}` : ""})`,
        message,
        detail,
      ].filter(Boolean).join(": ");
    }
  }
  return `QuickBooks API error (${status})`;
}

/**
 * Create a per-company QuickBooks client bound to a PluginContext. The returned
 * client exposes typed helpers for `query`, `getEntity`, `createEntity`, and
 * `report` — all of which handle token refresh and error wrapping.
 */
export function createQuickBooksClient(
  ctx: PluginContext,
  companyId: string,
  opts: QuickBooksClientOptions,
) {
  async function request<T>(pathname: string, options: QuickBooksRequestOptions = {}): Promise<T> {
    const token = await ensureFreshToken(ctx, companyId, opts);
    const url = buildRequestUrl(baseUrl(opts.sandbox), token.realmId, pathname, options.query);

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token.accessToken}`,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = options.contentType ?? "application/json";
      body = typeof options.body === "string"
        ? options.body
        : JSON.stringify(options.body);
    }

    const res = await fetch(url, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      throw new QuickBooksApiError(
        extractApiErrorMessage(parsed, res.status),
        res.status,
        parsed,
      );
    }
    return parsed as T;
  }

  /** Run a QuickBooks SQL-like query (`SELECT ... FROM ...`). */
  async function query<T = Record<string, unknown>>(statement: string): Promise<T> {
    return request<T>("query", {
      method: "POST",
      body: statement,
      contentType: "application/text",
    });
  }

  async function getEntity<T = Record<string, unknown>>(entity: string, id: string): Promise<T> {
    return request<T>(`${entity}/${encodeURIComponent(id)}`);
  }

  async function createEntity<T = Record<string, unknown>>(
    entity: string,
    payload: unknown,
  ): Promise<T> {
    return request<T>(entity, {
      method: "POST",
      body: payload,
    });
  }

  async function report<T = Record<string, unknown>>(
    reportName: string,
    query: Record<string, string | number | undefined> = {},
  ): Promise<T> {
    return request<T>(`reports/${reportName}`, { query });
  }

  async function companyInfo<T = Record<string, unknown>>(): Promise<T> {
    const token = await ensureFreshToken(ctx, companyId, opts);
    return getEntity<T>("companyinfo", token.realmId);
  }

  async function sendInvoice<T = Record<string, unknown>>(
    invoiceId: string,
    emailAddress: string,
  ): Promise<T> {
    return request<T>(`invoice/${encodeURIComponent(invoiceId)}/send`, {
      method: "POST",
      query: { sendTo: emailAddress },
    });
  }

  return { request, query, getEntity, createEntity, report, companyInfo, sendInvoice };
}

export type QuickBooksClient = ReturnType<typeof createQuickBooksClient>;
