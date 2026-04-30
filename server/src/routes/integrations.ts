import { Router } from "express";
import { createHash, randomBytes } from "node:crypto";
import type { Db } from "@paperclipai/db";
import {
  buildGmailAuthUrl,
  exchangeGmailCode,
  type GmailOAuthConfig,
} from "@paperclipai/plugin-email/providers/gmail";
import {
  buildOutlookAuthUrl,
  exchangeOutlookCode,
  type OutlookOAuthConfig,
} from "@paperclipai/plugin-email/providers/outlook";
import { badRequest, notFound, unprocessable } from "../errors.js";
import {
  requireGustoEnv,
  exchangeGustoCode,
  fetchGustoCurrentCompany,
  gustoOAuthStore,
  type GustoToken,
} from "../services/gusto-client.js";
import { pluginStateStore } from "../services/plugin-state-store.js";
import { pluginRegistryService } from "../services/plugin-registry.js";
import { emailOAuthStore, type EmailProviderKey } from "../services/email-oauth-store.js";
import { logActivity } from "../services/activity-log.js";
import { assertCompanyAccess } from "./authz.js";

/**
 * QuickBooks Online OAuth2 integration endpoints.
 *
 * Keeps the interactive authorization flow on the main server so that the
 * redirect URI is stable (plugin workers are not addressable externally).
 * Tokens are persisted into the QuickBooks plugin's state store under
 *   scopeKind = "company", namespace = "quickbooks", stateKey = "oauth-token"
 * which is the same shape the worker reads at runtime.
 */

const QB_PLUGIN_KEY = "paperclip.quickbooks";
const QB_STATE_NAMESPACE = "quickbooks";
const QB_TOKEN_STATE_KEY = "oauth-token";
const QB_AUTH_NAMESPACE = "quickbooks-oauth-state";
const QB_AUTH_STATE_TTL_MS = 15 * 60 * 1000;

const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QUICKBOOKS_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const DEFAULT_SCOPE = "com.intuit.quickbooks.accounting openid profile email";

interface StoredToken {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  expiresAt: string;
  refreshTokenExpiresAt?: string;
  scope?: string;
  updatedAt?: string;
}

interface OAuthPendingState {
  companyId: string;
  codeVerifier: string;
  redirectUri: string;
  createdAt: string;
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function generateCodeVerifier(): string {
  return base64Url(randomBytes(48));
}

function deriveCodeChallenge(verifier: string): string {
  return base64Url(createHash("sha256").update(verifier).digest());
}

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.length === 0) throw unprocessable(`QuickBooks integration misconfigured: ${name} is not set`);
  return v;
}

function basicAuth(clientId: string, clientSecret: string): string {
  return "Basic " + Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
}

async function postToken(
  body: URLSearchParams,
  clientId: string,
  clientSecret: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
  x_refresh_token_expires_in?: number;
  scope?: string;
}> {
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
  if (!res.ok) throw unprocessable(`QuickBooks token exchange failed (${res.status}): ${text}`);
  try {
    return JSON.parse(text) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      x_refresh_token_expires_in?: number;
      scope?: string;
    };
  } catch {
    throw unprocessable(`QuickBooks token endpoint returned non-JSON: ${text}`);
  }
}

function buildToken(
  resp: { access_token: string; refresh_token: string; expires_in: number; x_refresh_token_expires_in?: number; scope?: string },
  realmId: string,
): StoredToken {
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

export function integrationRoutes(db: Db) {
  const router = Router();
  const stateStore = pluginStateStore(db);
  const registry = pluginRegistryService(db);

  async function requireQuickBooksPluginId(): Promise<string> {
    const plugin = await registry.getByKey(QB_PLUGIN_KEY);
    if (!plugin) {
      throw notFound(`QuickBooks plugin not installed (${QB_PLUGIN_KEY})`);
    }
    return plugin.id;
  }

  function requireString(value: unknown, field: string): string {
    if (typeof value !== "string" || value.length === 0) {
      throw badRequest(`${field} is required`);
    }
    return value;
  }

  /**
   * GET /api/integrations/quickbooks/connect?companyId=
   *
   * Starts the OAuth flow — returns the Intuit authorization URL that the
   * caller should redirect the user to. Also persists the PKCE verifier and
   * redirect URI keyed by an opaque `state` token so the callback can resume.
   */
  router.get("/quickbooks/connect", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
    requireEnv("QUICKBOOKS_CLIENT_SECRET");
    const redirectUri = requireEnv("QUICKBOOKS_REDIRECT_URI");

    const pluginId = await requireQuickBooksPluginId();

    const state = base64Url(randomBytes(24));
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = deriveCodeChallenge(codeVerifier);

    const pending: OAuthPendingState = {
      companyId,
      codeVerifier,
      redirectUri,
      createdAt: new Date().toISOString(),
    };

    await stateStore.set(pluginId, {
      scopeKind: "instance",
      namespace: QB_AUTH_NAMESPACE,
      stateKey: state,
      value: pending,
    });

    const url = new URL(QUICKBOOKS_AUTHORIZE_URL);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", DEFAULT_SCOPE);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    res.json({ authorizationUrl: url.toString() });
  });

  /**
   * GET /api/integrations/quickbooks/callback?code=&state=&realmId=
   *
   * OAuth redirect target. Exchanges the authorization code for tokens,
   * persists them on the plugin state store for the originating company, then
   * redirects the browser back into the Paperclip UI.
   */
  router.get("/quickbooks/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    const realmId = typeof req.query.realmId === "string" ? req.query.realmId : "";
    if (!code || !state || !realmId) {
      throw badRequest("`code`, `state`, and `realmId` are required on the callback");
    }

    const pluginId = await requireQuickBooksPluginId();

    const pendingRaw = await stateStore.get(
      pluginId,
      "instance",
      state,
      { namespace: QB_AUTH_NAMESPACE },
    );
    if (!pendingRaw || typeof pendingRaw !== "object") {
      throw badRequest("Unknown or expired OAuth state");
    }
    const pending = pendingRaw as OAuthPendingState;
    if (Date.now() - Date.parse(pending.createdAt) > QB_AUTH_STATE_TTL_MS) {
      await stateStore.delete(pluginId, "instance", state, { namespace: QB_AUTH_NAMESPACE });
      throw badRequest("OAuth state expired — please restart the connect flow");
    }

    const clientId = requireEnv("QUICKBOOKS_CLIENT_ID");
    const clientSecret = requireEnv("QUICKBOOKS_CLIENT_SECRET");

    const resp = await postToken(
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: pending.redirectUri,
        code_verifier: pending.codeVerifier,
      }),
      clientId,
      clientSecret,
    );

    const token = buildToken(resp, realmId);

    await stateStore.set(pluginId, {
      scopeKind: "company",
      scopeId: pending.companyId,
      namespace: QB_STATE_NAMESPACE,
      stateKey: QB_TOKEN_STATE_KEY,
      value: token as unknown as Record<string, unknown>,
    });

    await stateStore.delete(pluginId, "instance", state, { namespace: QB_AUTH_NAMESPACE });

    const uiRedirect = process.env.QUICKBOOKS_UI_REDIRECT_URL
      ?? `/companies/${encodeURIComponent(pending.companyId)}/settings/integrations?quickbooks=connected`;
    res.redirect(uiRedirect);
  });

  /**
   * GET /api/integrations/quickbooks/status?companyId=
   *
   * Reports whether a token is stored for the company and when it expires.
   * Does NOT surface the access token itself.
   */
  router.get("/quickbooks/status", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const pluginId = await requireQuickBooksPluginId();

    const stored = await stateStore.get(
      pluginId,
      "company",
      QB_TOKEN_STATE_KEY,
      { scopeId: companyId, namespace: QB_STATE_NAMESPACE },
    );
    if (!stored || typeof stored !== "object") {
      res.json({ connected: false });
      return;
    }
    const token = stored as StoredToken;
    res.json({
      connected: true,
      realmId: token.realmId,
      expiresAt: token.expiresAt,
      refreshTokenExpiresAt: token.refreshTokenExpiresAt,
      scope: token.scope,
      updatedAt: token.updatedAt,
    });
  });

  /**
   * DELETE /api/integrations/quickbooks/disconnect?companyId=
   *
   * Clears the stored tokens for the company and best-effort revokes the
   * refresh token with Intuit.
   */
  router.delete("/quickbooks/disconnect", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const pluginId = await requireQuickBooksPluginId();

    const stored = await stateStore.get(
      pluginId,
      "company",
      QB_TOKEN_STATE_KEY,
      { scopeId: companyId, namespace: QB_STATE_NAMESPACE },
    );

    if (stored && typeof stored === "object") {
      const token = stored as StoredToken;
      const clientId = process.env.QUICKBOOKS_CLIENT_ID;
      const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
      if (clientId && clientSecret) {
        try {
          await fetch(QUICKBOOKS_REVOKE_URL, {
            method: "POST",
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              Authorization: basicAuth(clientId, clientSecret),
            },
            body: JSON.stringify({ token: token.refreshToken }),
          });
        } catch {
          // Revocation is best-effort — proceed with local deletion even if the
          // remote endpoint is unreachable.
        }
      }
    }

    await stateStore.delete(
      pluginId,
      "company",
      QB_TOKEN_STATE_KEY,
      { scopeId: companyId, namespace: QB_STATE_NAMESPACE },
    );

    res.json({ ok: true });
  });

  // ---------------------------------------------------------------------
  // Email (Gmail + Outlook) OAuth flows
  // ---------------------------------------------------------------------

  const EMAIL_STATE_TTL_MS = 10 * 60 * 1000;
  interface EmailPendingState {
    companyId: string;
    provider: EmailProviderKey;
    createdAt: number;
  }
  const emailPendingStates = new Map<string, EmailPendingState>();

  function issueEmailState(companyId: string, provider: EmailProviderKey): string {
    const stateToken = randomBytes(24).toString("hex");
    emailPendingStates.set(stateToken, { companyId, provider, createdAt: Date.now() });
    const cutoff = Date.now() - EMAIL_STATE_TTL_MS;
    for (const [key, entry] of emailPendingStates) {
      if (entry.createdAt < cutoff) emailPendingStates.delete(key);
    }
    return stateToken;
  }

  function consumeEmailState(stateToken: string): EmailPendingState | null {
    const entry = emailPendingStates.get(stateToken);
    if (!entry) return null;
    emailPendingStates.delete(stateToken);
    if (Date.now() - entry.createdAt > EMAIL_STATE_TTL_MS) return null;
    return entry;
  }

  function readEnvValue(name: string): string {
    return (process.env[name] ?? "").trim();
  }

  function gmailOAuthConfig(): GmailOAuthConfig {
    const clientId = readEnvValue("GMAIL_CLIENT_ID");
    const clientSecret = readEnvValue("GMAIL_CLIENT_SECRET");
    const redirectUri = readEnvValue("EMAIL_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      throw unprocessable(
        "Gmail integration misconfigured: set GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and EMAIL_REDIRECT_URI",
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  function outlookOAuthConfig(): OutlookOAuthConfig {
    const clientId = readEnvValue("OUTLOOK_CLIENT_ID");
    const clientSecret = readEnvValue("OUTLOOK_CLIENT_SECRET");
    const redirectUri = readEnvValue("EMAIL_REDIRECT_URI");
    if (!clientId || !clientSecret || !redirectUri) {
      throw unprocessable(
        "Outlook integration misconfigured: set OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET and EMAIL_REDIRECT_URI",
      );
    }
    return { clientId, clientSecret, redirectUri };
  }

  function emailSettingsRedirect(status: string, provider?: string, extra?: Record<string, string>): string {
    const base = readEnvValue("EMAIL_UI_REDIRECT_URL") || "/settings/integrations";
    const params = new URLSearchParams({ email_status: status });
    if (provider) params.set("email_provider", provider);
    if (extra) for (const [k, v] of Object.entries(extra)) params.set(k, v);
    return base.includes("?") ? `${base}&${params.toString()}` : `${base}?${params.toString()}`;
  }

  function isEmailProviderKey(value: unknown): value is EmailProviderKey {
    return value === "gmail" || value === "outlook";
  }

  /**
   * GET /api/integrations/email/connect?companyId=&provider=gmail|outlook
   */
  router.get("/email/connect", (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    const provider = req.query.provider;
    if (!isEmailProviderKey(provider)) {
      throw badRequest("provider must be 'gmail' or 'outlook'");
    }
    assertCompanyAccess(req, companyId);
    const stateToken = issueEmailState(companyId, provider);
    const url =
      provider === "gmail"
        ? buildGmailAuthUrl(gmailOAuthConfig(), stateToken)
        : buildOutlookAuthUrl(outlookOAuthConfig(), stateToken);
    res.json({ url, authorizationUrl: url, state: stateToken });
  });

  /**
   * GET /api/integrations/email/status?companyId=
   */
  router.get("/email/status", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const tokens = await emailOAuthStore.listForCompany(companyId);
    res.json({
      gmail: {
        connected: !!tokens.gmail,
        emailAddress: tokens.gmail?.emailAddress ?? null,
      },
      outlook: {
        connected: !!tokens.outlook,
        emailAddress: tokens.outlook?.emailAddress ?? null,
      },
    });
  });

  /**
   * DELETE /api/integrations/email/disconnect?companyId=&provider=
   */
  router.delete("/email/disconnect", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    const provider = req.query.provider;
    if (!isEmailProviderKey(provider)) {
      throw badRequest("provider must be 'gmail' or 'outlook'");
    }
    assertCompanyAccess(req, companyId);
    await emailOAuthStore.delete(companyId, provider);
    await logActivity(db, {
      companyId,
      actorType: "user",
      actorId: req.actor.type === "board" ? (req.actor.userId ?? "board") : "system",
      action: "email_integration.disconnected",
      entityType: "email_integration",
      entityId: provider,
      details: { provider },
    });
    res.json({ ok: true });
  });

  /**
   * GET /api/integrations/gmail/callback
   */
  router.get("/gmail/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateToken = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !stateToken) {
      res.redirect(emailSettingsRedirect("error", "gmail"));
      return;
    }
    const entry = consumeEmailState(stateToken);
    if (!entry || entry.provider !== "gmail") {
      res.redirect(emailSettingsRedirect("invalid_state", "gmail"));
      return;
    }
    try {
      const tokens = await exchangeGmailCode(gmailOAuthConfig(), code);
      await emailOAuthStore.set(entry.companyId, tokens);
      await logActivity(db, {
        companyId: entry.companyId,
        actorType: "user",
        actorId: req.actor.type === "board" ? (req.actor.userId ?? "board") : "system",
        action: "email_integration.connected",
        entityType: "email_integration",
        entityId: "gmail",
        details: { provider: "gmail", emailAddress: tokens.emailAddress },
      });
      res.redirect(emailSettingsRedirect("connected", "gmail"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.redirect(emailSettingsRedirect("error", "gmail", { email_error: message }));
    }
  });

  /**
   * GET /api/integrations/outlook/callback
   */
  router.get("/outlook/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const stateToken = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !stateToken) {
      res.redirect(emailSettingsRedirect("error", "outlook"));
      return;
    }
    const entry = consumeEmailState(stateToken);
    if (!entry || entry.provider !== "outlook") {
      res.redirect(emailSettingsRedirect("invalid_state", "outlook"));
      return;
    }
    try {
      const tokens = await exchangeOutlookCode(outlookOAuthConfig(), code);
      await emailOAuthStore.set(entry.companyId, tokens);
      await logActivity(db, {
        companyId: entry.companyId,
        actorType: "user",
        actorId: req.actor.type === "board" ? (req.actor.userId ?? "board") : "system",
        action: "email_integration.connected",
        entityType: "email_integration",
        entityId: "outlook",
        details: { provider: "outlook", emailAddress: tokens.emailAddress },
      });
      res.redirect(emailSettingsRedirect("connected", "outlook"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      res.redirect(emailSettingsRedirect("error", "outlook", { email_error: message }));
    }
  });

  // ---------------------------------------------------------------------
  // Gusto Payroll OAuth flows
  // ---------------------------------------------------------------------

  const GUSTO_PLUGIN_KEY = "paperclip.gusto";
  const GUSTO_STATE_NAMESPACE = "gusto";
  const GUSTO_TOKEN_STATE_KEY = "oauth-token";

  async function requireGustoPluginId(): Promise<string | null> {
    try {
      const plugin = await registry.getByKey(GUSTO_PLUGIN_KEY);
      return plugin?.id ?? null;
    } catch {
      return null;
    }
  }

  function gustoBaseUrl(): string {
    return process.env.GUSTO_SANDBOX === "true"
      ? "https://api.gusto-demo.com"
      : "https://api.gusto.com";
  }

  /**
   * GET /api/integrations/gusto/connect?companyId=
   *
   * Redirects the user to Gusto's OAuth authorization page.
   * Encodes companyId as the OAuth state parameter.
   */
  router.get("/gusto/connect", (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const { clientId, redirectUri } = requireGustoEnv();

    const url = new URL(`${gustoBaseUrl()}/oauth/authorize`);
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid");
    url.searchParams.set("state", companyId);

    res.redirect(url.toString());
  });

  /**
   * GET /api/integrations/gusto/callback?code=&state=
   *
   * OAuth redirect target. Exchanges the authorization code for tokens,
   * fetches the Gusto company info, persists the token, then redirects
   * the browser back to the integrations page.
   */
  router.get("/gusto/callback", async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : "";
    const state = typeof req.query.state === "string" ? req.query.state : "";
    if (!code || !state) {
      res.redirect("/integrations?gusto=error");
      return;
    }

    const companyId = state;

    try {
      const { clientId, clientSecret, redirectUri } = requireGustoEnv();
      const exchanged = await exchangeGustoCode(code, redirectUri, clientId, clientSecret);
      const company = await fetchGustoCurrentCompany(exchanged.accessToken, exchanged.tokenType);

      const token: GustoToken = {
        accessToken: exchanged.accessToken,
        refreshToken: exchanged.refreshToken,
        expiresAt: exchanged.expiresAt,
        tokenType: exchanged.tokenType,
        gustoCompanyUuid: company.uuid,
        gustoCompanyName: company.name,
        updatedAt: new Date().toISOString(),
      };

      await gustoOAuthStore(db).set(companyId, token);

      // Also persist into the plugin state store so the Gusto plugin worker
      // can read the token via ctx.state.get() — mirroring the QB pattern.
      const gustoPluginId = await requireGustoPluginId();
      if (gustoPluginId) {
        await stateStore.set(gustoPluginId, {
          scopeKind: "company",
          scopeId: companyId,
          namespace: GUSTO_STATE_NAMESPACE,
          stateKey: GUSTO_TOKEN_STATE_KEY,
          value: token as unknown as Record<string, unknown>,
        });
      }

      res.redirect("/integrations?gusto=connected");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[gusto] callback error:", message);
      res.redirect("/integrations?gusto=error");
    }
  });

  /**
   * GET /api/integrations/gusto/status?companyId=
   *
   * Reports whether a Gusto token is stored for the company.
   */
  router.get("/gusto/status", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const token = await gustoOAuthStore(db).get(companyId);
    res.json({
      connected: !!token,
      gustoCompanyName: token?.gustoCompanyName ?? null,
      gustoCompanyUuid: token?.gustoCompanyUuid ?? null,
    });
  });

  /**
   * DELETE /api/integrations/gusto/disconnect?companyId=
   *
   * Clears the stored Gusto tokens for the company.
   */
  router.delete("/gusto/disconnect", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    await gustoOAuthStore(db).delete(companyId);

    // Also clear from the plugin state store so the worker sees the token gone.
    const gustoPluginId = await requireGustoPluginId();
    if (gustoPluginId) {
      await stateStore.delete(
        gustoPluginId,
        "company",
        GUSTO_TOKEN_STATE_KEY,
        { scopeId: companyId, namespace: GUSTO_STATE_NAMESPACE },
      );
    }

    res.json({ ok: true });
  });

  return router;
}
