import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import {
  chatWidgetSessions,
  chatWidgetSettings,
  companies,
  type ChatWidgetMessage,
  type Db,
} from "@paperclipai/db";
import { validate } from "../middleware/validate.js";

function applyCors(_req: Request, res: Response, next: NextFunction): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "600");
  next();
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createSessionSchema = z.object({
  pageUrl: z.string().trim().max(2048).optional(),
});

const messageSchema = z.object({
  sessionId: z.string().regex(UUID_REGEX, "sessionId must be a UUID"),
  content: z.string().trim().min(1).max(4000),
});

const leadSchema = z.object({
  sessionId: z.string().regex(UUID_REGEX, "sessionId must be a UUID"),
  name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(64).optional(),
});

async function loadEffectiveSettings(db: Db, companyId: string) {
  const [existing] = await db
    .select()
    .from(chatWidgetSettings)
    .where(eq(chatWidgetSettings.companyId, companyId))
    .limit(1);
  if (existing) return existing;
  return {
    companyId,
    welcomeMessage: "Hi! How can we help you today?",
    agentName: "Avero AI",
    brandColor: "#2563eb",
    collectEmail: true,
    collectPhone: false,
  };
}

async function companyExists(db: Db, companyId: string): Promise<boolean> {
  if (!UUID_REGEX.test(companyId)) return false;
  const [row] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return !!row;
}

function canonicalMessages(raw: unknown): ChatWidgetMessage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((m): m is ChatWidgetMessage => {
    return (
      !!m &&
      typeof m === "object" &&
      typeof (m as ChatWidgetMessage).role === "string" &&
      typeof (m as ChatWidgetMessage).content === "string"
    );
  });
}

function autoReply(userContent: string, agentName: string): string {
  const trimmed = userContent.trim();
  if (!trimmed) return `Thanks for reaching out — how can ${agentName} help?`;
  return `Thanks! A team member from ${agentName} will follow up shortly. In the meantime, let us know any other details about: "${trimmed.slice(0, 120)}".`;
}

export function chatWidgetRoutes(db: Db) {
  const router = Router();

  router.use("/widget", applyCors);

  router.options("/widget/:companyId/*splat", (_req, res) => {
    res.status(204).end();
  });

  router.get("/widget/:companyId/config", async (req, res) => {
    const companyId = req.params.companyId as string;
    if (!(await companyExists(db, companyId))) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const settings = await loadEffectiveSettings(db, companyId);
    res.json({
      companyId,
      welcomeMessage: settings.welcomeMessage,
      agentName: settings.agentName,
      brandColor: settings.brandColor,
      collectEmail: settings.collectEmail,
      collectPhone: settings.collectPhone,
    });
  });

  router.post(
    "/widget/:companyId/session",
    validate(createSessionSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      if (!(await companyExists(db, companyId))) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const pageUrl = (req.body as { pageUrl?: string }).pageUrl ?? null;
      const [created] = await db
        .insert(chatWidgetSessions)
        .values({
          companyId,
          pageUrl,
          messages: [],
        })
        .returning({
          sessionId: chatWidgetSessions.sessionId,
        });
      if (!created) {
        res.status(500).json({ error: "Failed to create session" });
        return;
      }
      res.status(201).json({ sessionId: created.sessionId });
    },
  );

  router.post(
    "/widget/:companyId/message",
    validate(messageSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const { sessionId, content } = req.body as z.infer<typeof messageSchema>;
      if (!(await companyExists(db, companyId))) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const [session] = await db
        .select()
        .from(chatWidgetSessions)
        .where(
          and(
            eq(chatWidgetSessions.companyId, companyId),
            eq(chatWidgetSessions.sessionId, sessionId),
          ),
        )
        .limit(1);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }

      const settings = await loadEffectiveSettings(db, companyId);
      const now = new Date().toISOString();
      const visitorMsg: ChatWidgetMessage = {
        role: "visitor",
        content,
        createdAt: now,
      };
      const reply = autoReply(content, settings.agentName);
      const agentMsg: ChatWidgetMessage = {
        role: "agent",
        content: reply,
        createdAt: new Date().toISOString(),
      };
      const nextMessages: ChatWidgetMessage[] = [
        ...canonicalMessages(session.messages),
        visitorMsg,
        agentMsg,
      ];
      await db
        .update(chatWidgetSessions)
        .set({ messages: nextMessages, updatedAt: new Date() })
        .where(eq(chatWidgetSessions.id, session.id));

      res.json({ reply, messages: nextMessages });
    },
  );

  router.get("/widget/:companyId/history/:sessionId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const sessionId = req.params.sessionId as string;
    if (!UUID_REGEX.test(sessionId)) {
      res.status(400).json({ error: "sessionId must be a UUID" });
      return;
    }
    if (!(await companyExists(db, companyId))) {
      res.status(404).json({ error: "Company not found" });
      return;
    }
    const [session] = await db
      .select()
      .from(chatWidgetSessions)
      .where(
        and(
          eq(chatWidgetSessions.companyId, companyId),
          eq(chatWidgetSessions.sessionId, sessionId),
        ),
      )
      .limit(1);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ messages: canonicalMessages(session.messages) });
  });

  router.post(
    "/widget/:companyId/lead",
    validate(leadSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const { sessionId, name, email, phone } = req.body as z.infer<
        typeof leadSchema
      >;
      if (!(await companyExists(db, companyId))) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const [session] = await db
        .select({ id: chatWidgetSessions.id })
        .from(chatWidgetSessions)
        .where(
          and(
            eq(chatWidgetSessions.companyId, companyId),
            eq(chatWidgetSessions.sessionId, sessionId),
          ),
        )
        .limit(1);
      if (!session) {
        res.status(404).json({ error: "Session not found" });
        return;
      }
      await db
        .update(chatWidgetSessions)
        .set({
          visitorName: name,
          visitorEmail: email ?? null,
          visitorPhone: phone ?? null,
          leadCaptured: true,
          updatedAt: new Date(),
        })
        .where(eq(chatWidgetSessions.id, session.id));
      res.json({ ok: true });
    },
  );

  return router;
}

export function chatWidgetSettingsAdminRoutes(db: Db) {
  const router = Router();

  const updateSchema = z.object({
    welcomeMessage: z.string().trim().min(1).max(500).optional(),
    agentName: z.string().trim().min(1).max(120).optional(),
    brandColor: z
      .string()
      .trim()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    collectEmail: z.boolean().optional(),
    collectPhone: z.boolean().optional(),
  });

  router.get("/companies/:companyId/chat-widget-settings", async (req, res) => {
    const companyId = req.params.companyId as string;
    // Intentionally permissive: any authenticated or local caller that reaches here
    // is scoped by the upstream actor middleware. The client sends through the /api router
    // which already applies boardMutationGuard for non-GET requests.
    const settings = await loadEffectiveSettings(db, companyId);
    res.json(settings);
  });

  router.put(
    "/companies/:companyId/chat-widget-settings",
    validate(updateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      if (!(await companyExists(db, companyId))) {
        res.status(404).json({ error: "Company not found" });
        return;
      }
      const patch = req.body as z.infer<typeof updateSchema>;
      const existing = await db
        .select()
        .from(chatWidgetSettings)
        .where(eq(chatWidgetSettings.companyId, companyId))
        .limit(1);
      if (existing.length === 0) {
        await db.insert(chatWidgetSettings).values({
          companyId,
          welcomeMessage:
            patch.welcomeMessage ?? "Hi! How can we help you today?",
          agentName: patch.agentName ?? "Avero AI",
          brandColor: patch.brandColor ?? "#2563eb",
          collectEmail: patch.collectEmail ?? true,
          collectPhone: patch.collectPhone ?? false,
        });
      } else {
        await db
          .update(chatWidgetSettings)
          .set({
            ...patch,
            updatedAt: new Date(),
          })
          .where(eq(chatWidgetSettings.companyId, companyId));
      }
      const settings = await loadEffectiveSettings(db, companyId);
      res.json(settings);
    },
  );

  return router;
}
