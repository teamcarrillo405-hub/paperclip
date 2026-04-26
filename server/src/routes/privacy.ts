// Register in server/src/app.ts:
// import { privacyRoutes } from "./routes/privacy.js";
// api.use(privacyRoutes(db));

import fs from "node:fs";
import path from "node:path";
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { auditLog } from "@paperclipai/db";
import { desc, eq } from "drizzle-orm";
import { eraseUserData, exportUserData, logGDPRAction } from "../services/gdpr.js";
import { dlpEnabled, BUILT_IN_PATTERNS } from "../middleware/dlp-filter.js";
import { assertBoard, assertInstanceAdmin } from "./authz.js";
import { badRequest, forbidden, notFound } from "../errors.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

// ---------------------------------------------------------------------------
// Consent store — JSON file at {instanceRoot}/data/consents.json
// Schema: Record<userId, { version: string; acceptedAt: string }>
// ---------------------------------------------------------------------------

type ConsentRecord = { version: string; acceptedAt: string };
type ConsentStore = Record<string, ConsentRecord>;

function consentsFilePath(): string {
  return path.join(resolvePaperclipInstanceRoot(), "data", "consents.json");
}

function readConsents(): ConsentStore {
  const p = consentsFilePath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as ConsentStore;
  } catch {
    return {};
  }
}

function writeConsents(store: ConsentStore): void {
  const p = consentsFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(store, null, 2), "utf8");
}

// ---------------------------------------------------------------------------
// Helper — assert that the authenticated user is acting on their own data
// ---------------------------------------------------------------------------

function assertSelfAccess(req: Request, targetUserId: string): void {
  if (req.actor.type === "none") throw forbidden("Authentication required");
  if (req.actor.type === "board") {
    const actorUserId = req.actor.userId;
    if (!req.actor.isInstanceAdmin && actorUserId !== targetUserId) {
      throw forbidden("You may only access your own privacy data");
    }
  }
  // Agents are not permitted to perform GDPR self-service actions
  if (req.actor.type === "agent") {
    throw forbidden("Agent principals cannot perform GDPR self-service operations");
  }
}

function resolveRequesterId(req: Request): string {
  if (req.actor.type === "board") return req.actor.userId ?? "unknown";
  return "system";
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function privacyRoutes(db: Db) {
  const router = Router();

  // ------------------------------------------------------------------
  // POST /privacy/erasure
  // ------------------------------------------------------------------
  router.post("/privacy/erasure", async (req, res) => {
    const body = req.body as { userId?: string } | undefined;
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") throw badRequest("userId is required");

    assertSelfAccess(req, userId);

    const result = await eraseUserData(db, userId);
    await logGDPRAction(db, "erasure", userId, resolveRequesterId(req));

    res.json(result);
  });

  // ------------------------------------------------------------------
  // GET /privacy/export?userId=...
  // ------------------------------------------------------------------
  router.get("/privacy/export", async (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    if (!userId) throw badRequest("userId query parameter is required");

    assertSelfAccess(req, userId);

    const data = await exportUserData(db, userId);
    await logGDPRAction(db, "export", userId, resolveRequesterId(req));

    res.json(data);
  });

  // ------------------------------------------------------------------
  // GET /privacy/consent-status?userId=...
  // ------------------------------------------------------------------
  router.get("/privacy/consent-status", async (req, res) => {
    const userId = typeof req.query.userId === "string" ? req.query.userId : undefined;
    if (!userId) throw badRequest("userId query parameter is required");

    assertSelfAccess(req, userId);

    const store = readConsents();
    const record = store[userId] ?? null;

    res.json({
      userId,
      hasConsented: record !== null,
      version: record?.version ?? null,
      acceptedAt: record?.acceptedAt ?? null,
    });
  });

  // ------------------------------------------------------------------
  // POST /privacy/consent
  // ------------------------------------------------------------------
  router.post("/privacy/consent", async (req, res) => {
    const body = req.body as { userId?: string; version?: string; acceptedAt?: string } | undefined;
    const userId = body?.userId;
    const version = body?.version;
    const acceptedAt = body?.acceptedAt ?? new Date().toISOString();

    if (!userId || typeof userId !== "string") throw badRequest("userId is required");
    if (!version || typeof version !== "string") throw badRequest("version is required");

    assertSelfAccess(req, userId);

    const store = readConsents();
    store[userId] = { version, acceptedAt };
    writeConsents(store);

    await logGDPRAction(db, "consent", userId, resolveRequesterId(req));

    res.json({ userId, version, acceptedAt, recorded: true });
  });

  // ------------------------------------------------------------------
  // Admin: GET /privacy/admin/erasures
  // ------------------------------------------------------------------
  router.get("/privacy/admin/erasures", async (req, res) => {
    assertInstanceAdmin(req);

    const rows = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.action, "gdpr.erasure"))
      .orderBy(desc(auditLog.timestamp))
      .limit(500);

    const erasures = rows.map((r) => ({
      id: r.id,
      targetUserId: r.resourceId ?? null,
      requestedBy: r.userId ?? null,
      timestamp: r.timestamp instanceof Date ? r.timestamp.toISOString() : String(r.timestamp),
      details: r.details ?? null,
    }));

    res.json({ erasures });
  });

  // ------------------------------------------------------------------
  // Admin: POST /privacy/admin/erasure
  // ------------------------------------------------------------------
  router.post("/privacy/admin/erasure", async (req, res) => {
    assertInstanceAdmin(req);

    const body = req.body as { userId?: string } | undefined;
    const userId = body?.userId;
    if (!userId || typeof userId !== "string") throw badRequest("userId is required");

    const result = await eraseUserData(db, userId);
    await logGDPRAction(db, "erasure", userId, resolveRequesterId(req));

    res.json(result);
  });

  // ------------------------------------------------------------------
  // Admin: GET /privacy/admin/dlp-config
  // ------------------------------------------------------------------
  router.get("/privacy/admin/dlp-config", async (req, res) => {
    assertInstanceAdmin(req);

    res.json({
      enabled: dlpEnabled(),
      patternCount: BUILT_IN_PATTERNS.length,
      patterns: BUILT_IN_PATTERNS.map((p) => p.name),
    });
  });

  // ------------------------------------------------------------------
  // Admin: PUT /privacy/admin/dlp-config
  // ------------------------------------------------------------------
  router.put("/privacy/admin/dlp-config", async (req, res) => {
    assertInstanceAdmin(req);

    const body = req.body as { enabled?: boolean } | undefined;
    if (typeof body?.enabled !== "boolean") throw badRequest("enabled (boolean) is required");

    setEnvVar("DLP_ENABLED", body.enabled ? "true" : "false");
    process.env.DLP_ENABLED = body.enabled ? "true" : "false";

    res.json({ enabled: body.enabled, patternCount: BUILT_IN_PATTERNS.length });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Write a single key=value into the instance .env file
// ---------------------------------------------------------------------------

function setEnvVar(key: string, value: string): void {
  const envPath = path.join(resolvePaperclipInstanceRoot(), ".env");
  let content = "";
  if (fs.existsSync(envPath)) {
    content = fs.readFileSync(envPath, "utf8");
  }

  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, line);
  } else {
    content = content ? `${content.trimEnd()}\n${line}\n` : `${line}\n`;
  }

  fs.mkdirSync(path.dirname(envPath), { recursive: true });
  fs.writeFileSync(envPath, content, "utf8");
}

// Re-export so compliance.ts can use it without a separate import path
export { setEnvVar };
