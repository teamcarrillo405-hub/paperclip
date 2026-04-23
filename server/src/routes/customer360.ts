import { Router } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { customerMemories, type Db } from "@paperclipai/db";
import type { CustomerMemoryEntry } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function nowIso(): Date {
  return new Date();
}

function normalizeMemories(raw: unknown): CustomerMemoryEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is CustomerMemoryEntry => {
    if (!entry || typeof entry !== "object") return false;
    const e = entry as Partial<CustomerMemoryEntry>;
    return typeof e.summary === "string" && typeof e.date === "string" && typeof e.type === "string";
  });
}

function sentimentLabel(score: number | null): "good" | "neutral" | "at-risk" | "unknown" {
  if (score === null) return "unknown";
  if (score >= 0.7) return "good";
  if (score >= 0.4) return "neutral";
  return "at-risk";
}

function toDto(row: typeof customerMemories.$inferSelect) {
  return {
    id: row.id,
    companyId: row.companyId,
    customerId: row.customerId,
    name: row.customerName,
    email: row.email,
    phone: row.phone,
    memories: row.memories ?? [],
    sentimentScore: row.sentimentScore,
    sentimentLabel: sentimentLabel(row.sentimentScore),
    lifetimeValue: row.lifetimeValue,
    lastInteractionAt: row.lastInteractionAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function customer360Routes(db: Db) {
  const router = Router();

  router.get("/customers", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 500);
    const rows = await db
      .select()
      .from(customerMemories)
      .where(eq(customerMemories.companyId, companyId))
      .orderBy(desc(customerMemories.lastInteractionAt))
      .limit(limit);
    res.json(rows.map(toDto));
  });

  router.get("/customers/search", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (q.length === 0) {
      res.json([]);
      return;
    }
    const needle = `%${q}%`;
    const rows = await db
      .select()
      .from(customerMemories)
      .where(
        and(
          eq(customerMemories.companyId, companyId),
          or(
            ilike(customerMemories.customerName, needle),
            ilike(customerMemories.email, needle),
            ilike(customerMemories.phone, needle),
          ),
        ),
      )
      .limit(50);
    res.json(rows.map(toDto));
  });

  router.get("/customers/at-risk", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const rows = await db
      .select()
      .from(customerMemories)
      .where(
        and(
          eq(customerMemories.companyId, companyId),
          sql`(${customerMemories.sentimentScore} IS NOT NULL AND ${customerMemories.sentimentScore} < 0.4)`,
        ),
      )
      .orderBy(customerMemories.sentimentScore);
    res.json(rows.map(toDto));
  });

  router.get("/customers/top", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const limit = Math.min(Number(req.query.limit ?? 10) || 10, 100);
    const rows = await db
      .select()
      .from(customerMemories)
      .where(eq(customerMemories.companyId, companyId))
      .orderBy(desc(customerMemories.lifetimeValue))
      .limit(limit);
    res.json(rows.map(toDto));
  });

  router.get("/customers/:id", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;
    const [row] = await db
      .select()
      .from(customerMemories)
      .where(and(eq(customerMemories.id, id), eq(customerMemories.companyId, companyId)))
      .limit(1);
    if (!row) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    const dto = toDto(row);
    const timeline = [...dto.memories].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
    res.json({ ...dto, timeline });
  });

  router.post("/customers", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const name = requireString(body.name, "name");
    const [row] = await db
      .insert(customerMemories)
      .values({
        companyId,
        customerId: optionalString(body.customerId),
        customerName: name,
        email: optionalString(body.email),
        phone: optionalString(body.phone),
        memories: [],
        lifetimeValue: optionalNumber(body.lifetimeValue) ?? 0,
      })
      .returning();
    res.status(201).json(toDto(row));
  });

  router.put("/customers/:id", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;
    const [existing] = await db
      .select()
      .from(customerMemories)
      .where(and(eq(customerMemories.id, id), eq(customerMemories.companyId, companyId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }
    const patch: Partial<typeof customerMemories.$inferInsert> = {
      updatedAt: nowIso(),
    };
    if (typeof body.name === "string") patch.customerName = body.name;
    if ("email" in body) patch.email = optionalString(body.email);
    if ("phone" in body) patch.phone = optionalString(body.phone);
    const sentiment = optionalNumber(body.sentimentScore);
    if (sentiment !== null) patch.sentimentScore = sentiment;
    const ltv = optionalNumber(body.lifetimeValue);
    if (ltv !== null) patch.lifetimeValue = ltv;

    const [updated] = await db
      .update(customerMemories)
      .set(patch)
      .where(eq(customerMemories.id, id))
      .returning();
    res.json(toDto(updated));
  });

  router.post("/customers/:id/interactions", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const id = req.params.id as string;
    const type = (typeof body.type === "string" && body.type.length > 0 ? body.type : "note") as
      | "note"
      | "interaction"
      | "system";
    const summary = requireString(body.summary, "summary");
    const dateStr = typeof body.date === "string" && body.date.length > 0
      ? body.date
      : new Date().toISOString();

    const [existing] = await db
      .select()
      .from(customerMemories)
      .where(and(eq(customerMemories.id, id), eq(customerMemories.companyId, companyId)))
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const entry: CustomerMemoryEntry = {
      type: type === "note" || type === "interaction" || type === "system" ? type : "interaction",
      summary,
      date: dateStr,
      createdAt: new Date().toISOString(),
      channel: typeof body.channel === "string" ? body.channel : undefined,
    };
    const memories = [...normalizeMemories(existing.memories), entry];

    const [updated] = await db
      .update(customerMemories)
      .set({
        memories,
        lastInteractionAt: new Date(dateStr),
        updatedAt: nowIso(),
      })
      .where(eq(customerMemories.id, id))
      .returning();

    res.status(201).json(toDto(updated));
  });

  return router;
}
