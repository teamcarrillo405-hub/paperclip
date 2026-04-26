// Register in server/src/app.ts:
// import { scimRoutes } from "./routes/scim.js";
// app.use("/scim", scimRoutes(db)); // SCIM goes on app not api (no /api prefix)

import { Router } from "express";
import { eq, ilike, count } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { Db } from "@paperclipai/db";
import { authUsers } from "@paperclipai/db";
import { scimAuth } from "../middleware/scim-auth.js";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_LIST_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
const SCIM_ERROR_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:Error";
const SCIM_CONTENT_TYPE = "application/scim+json";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function scimError(res: import("express").Response, status: number, detail: string): void {
  res.status(status).type(SCIM_CONTENT_TYPE).json({
    schemas: [SCIM_ERROR_SCHEMA],
    detail,
    status,
  });
}

type DbUser = typeof authUsers.$inferSelect;

function toScimUser(user: DbUser): object {
  const created = user.createdAt?.toISOString() ?? new Date().toISOString();
  const updated = user.updatedAt?.toISOString() ?? created;
  return {
    schemas: [SCIM_USER_SCHEMA],
    id: user.id,
    userName: user.email,
    name: { formatted: user.name },
    emails: [{ value: user.email, primary: true }],
    active: true, // authUsers has no "active" column — treat all existing users as active
    meta: {
      resourceType: "User",
      created,
      lastModified: updated,
      location: `/scim/v2/Users/${user.id}`,
    },
  };
}

function parseName(body: Record<string, unknown>): string | undefined {
  const name = body["name"] as Record<string, string> | string | undefined;
  if (!name) return undefined;
  if (typeof name === "string") return name;
  if (name["formatted"]) return name["formatted"];
  const given = name["givenName"] ?? "";
  const family = name["familyName"] ?? "";
  const combined = [given, family].filter(Boolean).join(" ");
  return combined || undefined;
}

function generateId(): string {
  return randomBytes(16).toString("hex");
}

// ---------------------------------------------------------------------------
// SCIM router
// ---------------------------------------------------------------------------

export function scimRoutes(db: Db) {
  const router = Router();

  // ServiceProviderConfig — no auth required
  router.get("/v2/ServiceProviderConfig", (_req, res) => {
    res.type(SCIM_CONTENT_TYPE).json({
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      documentationUri: "https://docs.averoai.com/scim",
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
    });
  });

  // All remaining routes require SCIM bearer token
  router.use(scimAuth);

  // -------------------------------------------------------------------------
  // GET /v2/Users — list users with optional filter and pagination
  // -------------------------------------------------------------------------
  router.get("/v2/Users", async (req, res) => {
    const filterParam = typeof req.query["filter"] === "string" ? req.query["filter"] : undefined;
    const startIndex = Math.max(1, parseInt(String(req.query["startIndex"] ?? "1"), 10));
    const countParam = Math.min(200, Math.max(1, parseInt(String(req.query["count"] ?? "100"), 10)));

    // Parse filter: only support `userName eq "value"` per SCIM spec
    let emailFilter: string | undefined;
    if (filterParam) {
      const match = /^userName\s+eq\s+"([^"]+)"/i.exec(filterParam);
      if (match?.[1]) {
        emailFilter = match[1].toLowerCase();
      }
    }

    const offset = startIndex - 1;

    const [totalResult, rows] = await Promise.all([
      db
        .select({ total: count() })
        .from(authUsers)
        .where(emailFilter ? ilike(authUsers.email, emailFilter) : undefined)
        .then((r) => r[0]?.total ?? 0),
      db
        .select()
        .from(authUsers)
        .where(emailFilter ? ilike(authUsers.email, emailFilter) : undefined)
        .limit(countParam)
        .offset(offset),
    ]);

    res.type(SCIM_CONTENT_TYPE).json({
      schemas: [SCIM_LIST_SCHEMA],
      totalResults: Number(totalResult),
      startIndex,
      itemsPerPage: rows.length,
      Resources: rows.map(toScimUser),
    });
  });

  // -------------------------------------------------------------------------
  // POST /v2/Users — create user
  // -------------------------------------------------------------------------
  router.post("/v2/Users", async (req, res) => {
    const body = req.body as Record<string, unknown>;

    const userName = typeof body["userName"] === "string" ? body["userName"].toLowerCase().trim() : "";
    if (!userName) {
      return scimError(res, 400, "userName is required");
    }

    const name = parseName(body) ?? userName.split("@")[0] ?? userName;

    // Check for duplicate
    const existing = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.email, userName))
      .then((r) => r[0] ?? null);

    if (existing) {
      return scimError(res, 409, `User with userName '${userName}' already exists`);
    }

    const now = new Date();
    const userId = generateId();

    const [created] = await db
      .insert(authUsers)
      .values({
        id: userId,
        email: userName,
        name,
        emailVerified: false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!created) {
      return scimError(res, 500, "Failed to create user");
    }

    return res.status(201).type(SCIM_CONTENT_TYPE).json(toScimUser(created));
  });

  // -------------------------------------------------------------------------
  // GET /v2/Users/:id — get single user
  // -------------------------------------------------------------------------
  router.get("/v2/Users/:id", async (req, res) => {
    const id = req.params["id"] ?? "";
    const user = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, id))
      .then((r) => r[0] ?? null);

    if (!user) {
      return scimError(res, 404, `User '${id}' not found`);
    }

    return res.type(SCIM_CONTENT_TYPE).json(toScimUser(user));
  });

  // -------------------------------------------------------------------------
  // PUT /v2/Users/:id — full replace
  // -------------------------------------------------------------------------
  router.put("/v2/Users/:id", async (req, res) => {
    const id = req.params["id"] ?? "";
    const body = req.body as Record<string, unknown>;

    const user = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, id))
      .then((r) => r[0] ?? null);

    if (!user) {
      return scimError(res, 404, `User '${id}' not found`);
    }

    const name = parseName(body) ?? user.name;
    const now = new Date();

    const [updated] = await db
      .update(authUsers)
      .set({ name, updatedAt: now })
      .where(eq(authUsers.id, id))
      .returning();

    if (!updated) {
      return scimError(res, 500, "Failed to update user");
    }

    return res.type(SCIM_CONTENT_TYPE).json(toScimUser(updated));
  });

  // -------------------------------------------------------------------------
  // PATCH /v2/Users/:id — partial update (Operations array)
  // -------------------------------------------------------------------------
  router.patch("/v2/Users/:id", async (req, res) => {
    const id = req.params["id"] ?? "";
    const body = req.body as Record<string, unknown>;

    const user = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, id))
      .then((r) => r[0] ?? null);

    if (!user) {
      return scimError(res, 404, `User '${id}' not found`);
    }

    const operations = Array.isArray(body["Operations"]) ? body["Operations"] as Array<Record<string, unknown>> : [];
    const now = new Date();
    const updates: { name?: string; updatedAt: Date } = { updatedAt: now };

    for (const op of operations) {
      const opType = typeof op["op"] === "string" ? op["op"].toLowerCase() : "";
      if (opType !== "replace") continue;

      const value = op["value"] as Record<string, unknown> | undefined;
      if (!value || typeof value !== "object") continue;

      // Handle active field (deactivation — no active column, log intent)
      // Handle name updates
      const nameVal = parseName(value);
      if (nameVal) {
        updates.name = nameVal;
      }
    }

    const [updated] = await db
      .update(authUsers)
      .set(updates)
      .where(eq(authUsers.id, id))
      .returning();

    if (!updated) {
      return scimError(res, 500, "Failed to patch user");
    }

    return res.type(SCIM_CONTENT_TYPE).json(toScimUser(updated));
  });

  // -------------------------------------------------------------------------
  // DELETE /v2/Users/:id — soft deactivate (no active column, we mark via
  // a naming convention: prefix email with "deactivated:" to block login
  // while preserving the user record and foreign keys)
  // -------------------------------------------------------------------------
  router.delete("/v2/Users/:id", async (req, res) => {
    const id = req.params["id"] ?? "";

    const user = await db
      .select()
      .from(authUsers)
      .where(eq(authUsers.id, id))
      .then((r) => r[0] ?? null);

    if (!user) {
      return scimError(res, 404, `User '${id}' not found`);
    }

    // Soft delete: prefix email so the user cannot log in via password or SSO
    const deactivatedEmail = user.email.startsWith("deactivated:")
      ? user.email
      : `deactivated:${user.email}`;

    await db
      .update(authUsers)
      .set({ email: deactivatedEmail, updatedAt: new Date() })
      .where(eq(authUsers.id, id));

    return res.status(204).end();
  });

  return router;
}
