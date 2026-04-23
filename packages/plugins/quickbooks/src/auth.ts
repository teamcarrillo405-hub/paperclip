/**
 * QuickBooks OAuth2 + PKCE helpers.
 *
 * Intuit's OAuth 2.0 endpoints:
 *   - authorize: https://appcenter.intuit.com/connect/oauth2
 *   - token:     https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer
 *
 * The access token expires every 60 minutes; the refresh token expires every
 * 100 days (rolling). We treat the refresh token as a long-lived credential
 * per company and auto-refresh access tokens on demand.
 *
 * PKCE is not strictly required by Intuit for confidential clients but the
 * spec encourages it and a few deployment scenarios (e.g. SPA-facing flows)
 * require it. Since this handler runs server-side we generate a verifier and
 * S256 challenge and send them through the flow.
 */

import { createHash, randomBytes } from "node:crypto";
import type { QuickBooksToken } from "./types.js";

export const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
export const QUICKBOOKS_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";

export const DEFAULT_SCOPE = "com.intuit.quickbooks.accounting openid profile email";

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/** Generate a PKCE code verifier (43–128 URL-safe characters). */
export function generateCodeVerifier(): string {
  return base64UrlEncode(randomBytes(48));
}

/** Derive the S256 code challenge from a verifier. */
export function deriveCodeChallenge(verifier: string): string {
  return base64UrlEncode(createHash("sha256").update(verifier).digest());
}

/** Build the QuickBooks authorization URL the user is redirected to. */
export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  scope?: string;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(QUICKBOOKS_AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", params.scope ?? DEFAULT_SCOPE);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

interface IntuitTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  token_type?: string;
  scope?: string;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function postToTokenEndpoint(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): Promise<IntuitTokenResponse> {
  const res = await fetch(QUICKBOOKS_TOKEN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(clientId, clientSecret),
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`QuickBooks token request failed (${res.status}): ${text}`);
  }

  try {
    return JSON.parse(text) as IntuitTokenResponse;
  } catch {
    throw new Error(`QuickBooks token endpoint returned non-JSON response: ${text}`);
  }
}

function tokenFromResponse(
  resp: IntuitTokenResponse,
  realmId: string,
): QuickBooksToken {
  const now = Date.now();
  return {
    accessToken: resp.access_token,
    refreshToken: resp.refresh_token,
    realmId,
    expiresAt: new Date(now + resp.expires_in * 1000).toISOString(),
    refreshTokenExpiresAt: resp.x_refresh_token_expires_in
      ? new Date(now + resp.x_refresh_token_expires_in * 1000).toISOString()
      : undefined,
    scope: resp.scope,
    updatedAt: new Date(now).toISOString(),
  };
}

/** Exchange the authorization code for an access/refresh token pair. */
export async function exchangeAuthorizationCode(params: {
  code: string;
  redirectUri: string;
  codeVerifier: string;
  realmId: string;
  clientId: string;
  clientSecret: string;
}): Promise<QuickBooksToken> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    redirect_uri: params.redirectUri,
    code_verifier: params.codeVerifier,
  });
  const resp = await postToTokenEndpoint(body, params.clientId, params.clientSecret);
  return tokenFromResponse(resp, params.realmId);
}

/** Refresh an access token using the stored refresh token. */
export async function refreshAccessToken(params: {
  refreshToken: string;
  realmId: string;
  clientId: string;
  clientSecret: string;
}): Promise<QuickBooksToken> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: params.refreshToken,
    // Intuit sometimes rotates the refresh token; the response always includes
    // both tokens so the caller should persist the new pair.
  });
  const resp = await postToTokenEndpoint(body, params.clientId, params.clientSecret);
  return tokenFromResponse(resp, params.realmId);
}

export async function revokeRefreshToken(params: {
  refreshToken: string;
  clientId: string;
  clientSecret: string;
}): Promise<void> {
  const res = await fetch(QUICKBOOKS_REVOKE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: basicAuth(params.clientId, params.clientSecret),
    },
    body: JSON.stringify({ token: params.refreshToken }),
  });
  if (!res.ok && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`QuickBooks token revocation failed (${res.status}): ${body}`);
  }
}

export function tokenNeedsRefresh(token: QuickBooksToken, now: number = Date.now()): boolean {
  const expiresAt = Date.parse(token.expiresAt);
  if (!Number.isFinite(expiresAt)) return true;
  return expiresAt - now <= TOKEN_REFRESH_BUFFER_MS;
}
