import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

function gustoBaseUrl(): string {
  return process.env.GUSTO_SANDBOX === "true"
    ? "https://api.gusto-demo.com"
    : "https://api.gusto.com";
}

export interface GustoToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  tokenType: string;
  gustoCompanyUuid: string;
  gustoCompanyName: string;
  updatedAt: string;
}

export interface GustoEmployee {
  uuid: string;
  first_name: string;
  last_name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  employment_status: string;
  start_date: string | null;
}

export interface GustoPayroll {
  payroll_uuid: string;
  processed: boolean;
  pay_period: { start_date: string; end_date: string };
  totals?: { company_debit: string; net_pay: string; gross_pay: string };
}

export interface GustoCompanyInfo {
  uuid: string;
  name: string;
  ein: string | null;
  entity_type: string | null;
  number_of_employees: number;
}

export interface GustoPaySchedule {
  uuid: string;
  frequency: string;
  anchor_pay_date: string;
  day_1: number | null;
  day_2: number | null;
}

type Store = Record<string, GustoToken>;

function storeFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "gusto-oauth.json");
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(storeFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  const file = storeFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf-8");
}

export const gustoOAuthStore = {
  get: async (companyId: string): Promise<GustoToken | null> => {
    const store = await readStore();
    return store[companyId] ?? null;
  },
  set: async (companyId: string, token: GustoToken): Promise<void> => {
    const store = await readStore();
    store[companyId] = token;
    await writeStore(store);
  },
  delete: async (companyId: string): Promise<void> => {
    const store = await readStore();
    delete store[companyId];
    await writeStore(store);
  },
};

export function requireGustoEnv(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = (process.env.GUSTO_CLIENT_ID ?? "").trim();
  const clientSecret = (process.env.GUSTO_CLIENT_SECRET ?? "").trim();
  const redirectUri = (process.env.GUSTO_REDIRECT_URI ?? "").trim();
  if (!clientId || !clientSecret || !redirectUri) {
    throw Object.assign(
      new Error("Gusto integration misconfigured: set GUSTO_CLIENT_ID, GUSTO_CLIENT_SECRET, GUSTO_REDIRECT_URI"),
      { status: 422 },
    );
  }
  return { clientId, clientSecret, redirectUri };
}

async function refreshIfExpired(companyId: string, token: GustoToken): Promise<GustoToken> {
  const expiresAt = new Date(token.expiresAt).getTime();
  if (Date.now() < expiresAt - 60_000) return token;

  const { clientId, clientSecret, redirectUri } = requireGustoEnv();
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
    throw Object.assign(new Error(`Gusto token refresh failed (${res.status}): ${text}`), { status: 502 });
  }
  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  const refreshed: GustoToken = {
    ...token,
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    tokenType: json.token_type ?? "Bearer",
    updatedAt: new Date().toISOString(),
  };
  await gustoOAuthStore.set(companyId, refreshed);
  return refreshed;
}

export async function gustoApiCall<T>(companyId: string, urlPath: string): Promise<T> {
  const token = await gustoOAuthStore.get(companyId);
  if (!token) {
    throw Object.assign(new Error("Gusto not connected for this company"), { status: 422 });
  }
  const fresh = await refreshIfExpired(companyId, token);
  const res = await fetch(`${gustoBaseUrl()}${urlPath}`, {
    headers: {
      Authorization: `${fresh.tokenType} ${fresh.accessToken}`,
      Accept: "application/json",
      "X-Gusto-API-Version": "2024-03-01",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`Gusto API error (${res.status}): ${text}`), { status: 502 });
  }
  return JSON.parse(text) as T;
}

export async function exchangeGustoCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: string; tokenType: string }> {
  const res = await fetch(`${gustoBaseUrl()}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`Gusto token exchange failed (${res.status}): ${text}`), { status: 502 });
  }
  const json = JSON.parse(text) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    token_type: string;
  };
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    tokenType: json.token_type ?? "Bearer",
  };
}

interface GustoMeResponse {
  email: string;
  companies: Array<{ uuid: string; name: string }>;
}

export async function fetchGustoCurrentCompany(
  accessToken: string,
  tokenType: string,
): Promise<{ uuid: string; name: string }> {
  const res = await fetch(`${gustoBaseUrl()}/v1/me`, {
    headers: {
      Authorization: `${tokenType} ${accessToken}`,
      Accept: "application/json",
      "X-Gusto-API-Version": "2024-03-01",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw Object.assign(new Error(`Gusto /v1/me failed (${res.status}): ${text}`), { status: 502 });
  }
  const me = JSON.parse(text) as GustoMeResponse;
  const first = me.companies?.[0];
  if (!first) {
    throw Object.assign(new Error("No Gusto companies found for this account"), { status: 422 });
  }
  return { uuid: first.uuid, name: first.name };
}
