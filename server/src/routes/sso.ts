// Register in server/src/app.ts:
// import { ssoRoutes } from "./routes/sso.js";
// api.use(ssoRoutes(db));

import { Router } from "express";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { authUsers, authSessions } from "@paperclipai/db";
import {
  discovery,
  buildAuthorizationUrl,
  authorizationCodeGrant,
  fetchUserInfo,
  randomState,
  randomNonce,
  skipSubjectCheck,
} from "openid-client";
import { getSSOConfig, saveSSOConfig, getProviderById } from "../services/sso-config.js";
import type { OIDCProvider, SSOConfig } from "../services/sso-config.js";
import { assertInstanceAdmin } from "./authz.js";
import { badRequest, notFound, forbidden, unprocessable } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { deriveAuthCookiePrefix } from "../auth/better-auth.js";

const SSO_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// ---------------------------------------------------------------------------
// Pending state store (file-based, keyed by opaque state token)
// ---------------------------------------------------------------------------

type PendingState = {
  providerId: string;
  companyId?: string;
  nonce: string;
  createdAt: string;
  codeVerifier?: string;
};

type PendingStore = Record<string, PendingState>;

function pendingStoreFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "sso-pending.json");
}

async function readPending(): Promise<PendingStore> {
  try {
    const raw = await fs.readFile(pendingStoreFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as PendingStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writePending(store: PendingStore): Promise<void> {
  const file = pendingStoreFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf-8");
}

async function storePendingState(stateKey: string, value: PendingState): Promise<void> {
  const store = await readPending();
  // Prune expired entries on write to avoid unbounded growth
  const now = Date.now();
  for (const [k, v] of Object.entries(store)) {
    if (now - Date.parse(v.createdAt) > SSO_STATE_TTL_MS) {
      delete store[k];
    }
  }
  store[stateKey] = value;
  await writePending(store);
}

async function consumePendingState(stateKey: string): Promise<PendingState | null> {
  const store = await readPending();
  const value = store[stateKey];
  if (!value) return null;
  delete store[stateKey];
  await writePending(store);
  if (Date.now() - Date.parse(value.createdAt) > SSO_STATE_TTL_MS) return null;
  return value;
}

// ---------------------------------------------------------------------------
// Session creation helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return randomBytes(16).toString("hex");
}

async function createSessionCookie(
  db: Db,
  userId: string,
  userAgent: string | undefined,
  ipAddress: string | undefined,
): Promise<string> {
  const sessionToken = randomBytes(32).toString("hex");
  const sessionId = generateId();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days

  await db.insert(authSessions).values({
    id: sessionId,
    token: sessionToken,
    userId,
    createdAt: now,
    updatedAt: now,
    expiresAt,
    userAgent: userAgent ?? null,
    ipAddress: ipAddress ?? null,
  });

  return sessionToken;
}

function buildSetCookieHeader(token: string, expiresAt: Date): string {
  const cookiePrefix = deriveAuthCookiePrefix();
  const name = `${cookiePrefix}.session_token`;
  const expires = expiresAt.toUTCString();
  return `${name}=${token}; Path=/; HttpOnly; SameSite=Lax; Expires=${expires}`;
}

// ---------------------------------------------------------------------------
// OIDC helpers
// ---------------------------------------------------------------------------

function redactProvider(p: OIDCProvider): Omit<OIDCProvider, "clientSecret"> & { clientSecret: string } {
  return { ...p, clientSecret: "***" };
}

function redactConfig(config: SSOConfig): SSOConfig {
  return {
    ...config,
    providers: config.providers.map((p) => redactProvider(p) as OIDCProvider),
  };
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function ssoRoutes(db: Db) {
  const router = Router();

  /**
   * GET /sso/providers
   * Return list of enabled providers (no secrets). Used by login page.
   */
  router.get("/sso/providers", async (_req, res) => {
    const config = await getSSOConfig();
    const providers = config.providers
      .filter((p) => p.enabled)
      .map((p) => ({ id: p.id, name: p.name }));
    res.json({ providers });
  });

  /**
   * GET /sso/:providerId/login?companyId=
   * Initiate OIDC authorization flow.
   */
  router.get("/sso/:providerId/login", async (req, res) => {
    const providerId = req.params["providerId"] ?? "";
    const companyId = typeof req.query["companyId"] === "string" ? req.query["companyId"] : undefined;

    const provider = await getProviderById(providerId);
    if (!provider || !provider.enabled) {
      throw notFound(`SSO provider '${providerId}' not found or disabled`);
    }

    const oidcConfig = await discovery(
      new URL(provider.discoveryUrl),
      provider.clientId,
      provider.clientSecret,
    );

    const stateToken = randomState();
    const nonce = randomNonce();

    const pending: PendingState = {
      providerId,
      companyId,
      nonce,
      createdAt: new Date().toISOString(),
    };
    await storePendingState(stateToken, pending);

    const callbackUrl = `${req.protocol}://${req.get("host")}/api/sso/callback`;

    const authUrl = buildAuthorizationUrl(oidcConfig, {
      redirect_uri: callbackUrl,
      scope: provider.scopes.join(" "),
      state: stateToken,
      nonce,
    });

    res.redirect(authUrl.href);
  });

  /**
   * GET /sso/callback?code=&state=
   * OIDC authorization code callback.
   */
  router.get("/sso/callback", async (req, res) => {
    const code = typeof req.query["code"] === "string" ? req.query["code"] : "";
    const stateParam = typeof req.query["state"] === "string" ? req.query["state"] : "";

    if (!code || !stateParam) {
      throw badRequest("Missing `code` or `state` in SSO callback");
    }

    const pending = await consumePendingState(stateParam);
    if (!pending) {
      throw badRequest("Unknown or expired SSO state — please restart the login flow");
    }

    const provider = await getProviderById(pending.providerId);
    if (!provider || !provider.enabled) {
      throw badRequest(`SSO provider '${pending.providerId}' is no longer available`);
    }

    const ssoConfig = await getSSOConfig();

    const callbackUrl = `${req.protocol}://${req.get("host")}/api/sso/callback`;

    const oidcConfig = await discovery(
      new URL(provider.discoveryUrl),
      provider.clientId,
      provider.clientSecret,
    );

    const currentUrl = new URL(callbackUrl);
    currentUrl.searchParams.set("code", code);
    currentUrl.searchParams.set("state", stateParam);

    const tokens = await authorizationCodeGrant(oidcConfig, currentUrl, {
      pkceCodeVerifier: pending.codeVerifier,
      expectedNonce: pending.nonce,
      expectedState: stateParam,
    });

    const claims = tokens.claims();

    // Extract user info from claims
    const emailClaim = provider.emailClaim || "email";
    const nameClaim = provider.nameClaim || "name";
    const groupsClaim = provider.groupsClaim;

    let email = claims?.[emailClaim];
    let name = claims?.[nameClaim];
    let groups: string[] = [];

    // If claims are sparse, fetch userinfo
    if (!email || !name) {
      try {
        const userInfo = await fetchUserInfo(oidcConfig, tokens.access_token!, skipSubjectCheck);
        if (!email) email = userInfo[emailClaim];
        if (!name) name = userInfo[nameClaim];
        if (groupsClaim && !groups.length) {
          const g = userInfo[groupsClaim];
          if (Array.isArray(g)) groups = g.map(String);
        }
      } catch {
        // userinfo endpoint is optional
      }
    }

    if (groupsClaim && claims) {
      const g = claims[groupsClaim];
      if (Array.isArray(g)) groups = g.map(String);
    }

    if (typeof email !== "string" || !email) {
      throw unprocessable("OIDC provider did not return a valid email address");
    }

    const emailStr = email.toLowerCase().trim();

    // Domain restriction check
    if (ssoConfig.allowedDomains && ssoConfig.allowedDomains.length > 0) {
      const domain = emailStr.split("@")[1] ?? "";
      if (!ssoConfig.allowedDomains.includes(domain)) {
        throw forbidden(`Email domain '@${domain}' is not permitted for SSO login`);
      }
    }

    // Find or create user
    const existingUsers = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, emailStr));

    let userId: string;
    const now = new Date();

    if (existingUsers.length > 0 && existingUsers[0]) {
      userId = existingUsers[0].id;
      // Update name if provided
      if (typeof name === "string" && name) {
        await db
          .update(authUsers)
          .set({ name, updatedAt: now })
          .where(eq(authUsers.id, userId));
      }
    } else {
      // Create new user
      userId = generateId();
      await db.insert(authUsers).values({
        id: userId,
        email: emailStr,
        name: typeof name === "string" && name ? name : emailStr.split("@")[0] ?? emailStr,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Admin group promotion
    if (provider.adminGroupName && groups.includes(provider.adminGroupName)) {
      // Import instanceUserRoles lazily to avoid circular dep
      const { instanceUserRoles } = await import("@paperclipai/db");
      const { and } = await import("drizzle-orm");
      const existing = await db
        .select()
        .from(instanceUserRoles)
        .where(
          and(
            eq(instanceUserRoles.userId, userId),
            eq(instanceUserRoles.role, "instance_admin"),
          ),
        );
      if (existing.length === 0) {
        await db.insert(instanceUserRoles).values({
          userId,
          role: "instance_admin",
        });
      }
    }

    // Create session
    const sessionToken = await createSessionCookie(
      db,
      userId,
      req.get("user-agent"),
      req.ip,
    );

    const sessionExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    res.setHeader("Set-Cookie", buildSetCookieHeader(sessionToken, sessionExpires));
    res.redirect("/");
  });

  /**
   * GET /sso/config
   * Return current SSO config (secrets redacted). Instance admin only.
   */
  router.get("/sso/config", async (req, res) => {
    assertInstanceAdmin(req);
    const config = await getSSOConfig();
    res.json(redactConfig(config));
  });

  /**
   * POST /sso/config
   * Save SSO config. Validates that all discovery URLs are reachable.
   */
  router.post("/sso/config", async (req, res) => {
    assertInstanceAdmin(req);

    const body = req.body as Partial<SSOConfig>;
    if (!body || typeof body !== "object") {
      throw badRequest("Request body must be a valid SSOConfig object");
    }
    if (!Array.isArray(body.providers)) {
      throw badRequest("providers must be an array");
    }

    // Validate each provider's discovery URL
    for (const p of body.providers as OIDCProvider[]) {
      if (!p.id || !p.clientId || !p.clientSecret || !p.discoveryUrl) {
        throw badRequest(`Provider '${p.id ?? "unknown"}' is missing required fields`);
      }
      try {
        await fetch(p.discoveryUrl, { method: "HEAD" });
      } catch {
        // Try GET as fallback
        try {
          const r = await fetch(p.discoveryUrl);
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        } catch (err) {
          throw unprocessable(
            `Discovery URL for provider '${p.id}' is not reachable: ${(err as Error).message}`,
          );
        }
      }
    }

    const config: SSOConfig = {
      providers: (body.providers as OIDCProvider[]).map((p) => ({
        id: p.id,
        name: p.name || p.id,
        clientId: p.clientId,
        clientSecret: p.clientSecret,
        discoveryUrl: p.discoveryUrl,
        scopes: Array.isArray(p.scopes) ? p.scopes : ["openid", "email", "profile"],
        enabled: Boolean(p.enabled),
        emailClaim: p.emailClaim || "email",
        nameClaim: p.nameClaim || "name",
        groupsClaim: p.groupsClaim,
        adminGroupName: p.adminGroupName,
      })),
      enforceSSO: Boolean(body.enforceSSO),
      allowedDomains: Array.isArray(body.allowedDomains) ? body.allowedDomains : undefined,
    };

    await saveSSOConfig(config);
    res.json(redactConfig(config));
  });

  /**
   * DELETE /sso/config/providers/:id
   * Remove a provider by ID. Instance admin only.
   */
  router.delete("/sso/config/providers/:id", async (req, res) => {
    assertInstanceAdmin(req);
    const id = req.params["id"] ?? "";
    const config = await getSSOConfig();
    const before = config.providers.length;
    config.providers = config.providers.filter((p) => p.id !== id);
    if (config.providers.length === before) {
      throw notFound(`Provider '${id}' not found`);
    }
    await saveSSOConfig(config);
    res.status(204).end();
  });

  /**
   * POST /sso/test/:providerId
   * Test OIDC discovery URL connectivity. Instance admin only.
   */
  router.post("/sso/test/:providerId", async (req, res) => {
    assertInstanceAdmin(req);
    const providerId = req.params["providerId"] ?? "";
    const provider = await getProviderById(providerId);
    if (!provider) {
      throw notFound(`Provider '${providerId}' not found`);
    }

    try {
      const oidcConfig = await discovery(
        new URL(provider.discoveryUrl),
        provider.clientId,
        provider.clientSecret,
      );
      res.json({ ok: true, issuer: oidcConfig.serverMetadata().issuer });
    } catch (err) {
      res.json({ ok: false, error: (err as Error).message });
    }
  });

  return router;
}
