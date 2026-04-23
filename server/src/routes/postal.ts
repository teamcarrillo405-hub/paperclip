import { Router, type Request } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { emailSends, type EmailSendRow } from "@paperclipai/db";
import {
  AveroPostalService,
  type EmailHistoryRow,
  type EmailSendsDb,
  type NodemailerLike,
} from "@paperclipai/plugin-postal";
import { validate } from "../middleware/validate.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";
import { logger } from "../middleware/logger.js";

function resolveCompanyId(req: Request): string | null {
  if (req.actor.type === "agent" && req.actor.companyId) return req.actor.companyId;
  if (req.actor.type === "board") {
    const explicit = (req.query.companyId ?? req.query.company_id) as unknown;
    if (typeof explicit === "string" && explicit.length > 0) return explicit;
    if (Array.isArray(req.actor.companyIds) && req.actor.companyIds.length > 0) {
      return req.actor.companyIds[0] ?? null;
    }
  }
  return null;
}

function rowToHistory(row: EmailSendRow): EmailHistoryRow {
  return {
    id: row.id,
    companyId: row.companyId,
    to: row.to,
    from: row.from,
    subject: row.subject,
    templateName: row.templateName,
    status: row.status,
    messageId: row.messageId,
    provider: row.provider,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

function buildDbAdapter(db: Db): EmailSendsDb {
  return {
    async insert(row) {
      await db.insert(emailSends).values({
        companyId: row.companyId,
        to: row.to,
        from: row.from,
        subject: row.subject,
        templateName: row.templateName,
        status: row.status,
        messageId: row.messageId,
        provider: row.provider,
        error: row.error,
      });
    },
    async listByCompany(companyId, limit) {
      const rows = await db
        .select()
        .from(emailSends)
        .where(eq(emailSends.companyId, companyId))
        .orderBy(desc(emailSends.createdAt))
        .limit(limit);
      return rows.map(rowToHistory);
    },
  };
}

async function loadNodemailer(): Promise<NodemailerLike | undefined> {
  try {
    const modName = "nodemailer";
    const mod = (await import(/* @vite-ignore */ modName)) as NodemailerLike & {
      default?: NodemailerLike;
    };
    return mod.default ?? mod;
  } catch {
    return undefined;
  }
}

const sendSchema = z.object({
  companyId: z.string().uuid().optional(),
  to: z.string().min(1),
  subject: z.string().min(1),
  html: z.string().min(1),
  text: z.string().optional(),
  from: z.string().optional(),
  replyTo: z.string().optional(),
});

const templateSchema = z.object({
  companyId: z.string().uuid().optional(),
  template: z.enum(["welcome", "invoice", "alert", "report", "followup"]),
  to: z.string().min(1),
  variables: z.record(z.unknown()).default({}),
});

const testSchema = z.object({
  companyId: z.string().uuid().optional(),
  to: z.string().min(1),
});

export function postalRoutes(db: Db) {
  const router = Router();
  const dbAdapter = buildDbAdapter(db);
  let service: AveroPostalService | null = null;

  async function getService(): Promise<AveroPostalService> {
    if (service) return service;
    const nm = await loadNodemailer();
    service = new AveroPostalService({ db: dbAdapter, nodemailer: nm, logger });
    return service;
  }

  router.get("/postal/status", async (req, res) => {
    const svc = await getService();
    res.json(svc.getConfigSummary());
  });

  router.post("/postal/send", validate(sendSchema), async (req, res) => {
    const body = req.body as z.infer<typeof sendSchema>;
    const companyId = body.companyId ?? resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId is required");
    assertCompanyAccess(req, companyId);
    const svc = await getService();
    const result = await svc.sendEmail(
      {
        to: body.to,
        subject: body.subject,
        html: body.html,
        text: body.text,
        from: body.from,
        replyTo: body.replyTo,
      },
      { companyId },
    );
    res.json(result);
  });

  router.post("/postal/template", validate(templateSchema), async (req, res) => {
    const body = req.body as z.infer<typeof templateSchema>;
    const companyId = body.companyId ?? resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId is required");
    assertCompanyAccess(req, companyId);
    const svc = await getService();
    const result = await svc.sendTemplate(
      body.template,
      body.to,
      body.variables as never,
      companyId,
    );
    res.json(result);
  });

  router.get("/postal/history", async (req, res) => {
    const companyId = (req.query.companyId as string | undefined) ?? resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId is required");
    assertCompanyAccess(req, companyId);
    const limit = req.query.limit ? Number(req.query.limit) : 50;
    const svc = await getService();
    const history = await svc.getEmailHistory(companyId, Number.isFinite(limit) ? limit : 50);
    res.json({ items: history });
  });

  router.post("/postal/test", validate(testSchema), async (req, res) => {
    const body = req.body as z.infer<typeof testSchema>;
    const companyId = body.companyId ?? resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId is required");
    assertCompanyAccess(req, companyId);
    const svc = await getService();
    const result = await svc.sendEmail(
      {
        to: body.to,
        subject: "Avero AI — Postal configuration test",
        html: `<p>This is a <strong>test email</strong> sent from your Avero AI Postal integration.</p>
               <p>Provider in use: <code>${svc.getProvider()}</code></p>`,
        text: `This is a test email. Provider: ${svc.getProvider()}`,
      },
      { companyId },
    );
    res.json(result);
  });

  return router;
}
