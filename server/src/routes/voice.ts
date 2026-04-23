import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { voiceCallLogs, type Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import { badRequest } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

const outboundBodySchema = z.object({
  companyId: z.string().min(1),
  to: z.string().min(1),
  script: z.string().min(1),
});

function resolveCompanyId(req: Request): string | null {
  if (req.actor.type === "agent" && req.actor.companyId) {
    return req.actor.companyId;
  }
  if (req.actor.type === "board") {
    const explicit = (req.query.companyId ?? req.query.company_id) as unknown;
    if (typeof explicit === "string" && explicit.length > 0) return explicit;
    const fromList = Array.isArray(req.actor.companyIds) ? req.actor.companyIds[0] : undefined;
    if (fromList) return fromList;
  }
  return null;
}

function normalizeDirection(value: unknown): "inbound" | "outbound" {
  if (value === "outbound" || value === "outbound-api") return "outbound";
  return "inbound";
}

export function voiceRoutes(db: Db) {
  const router = Router();

  // Twilio inbound webhook — no auth, Twilio-signed requests.
  // Twilio posts form-encoded params: CallSid, From, To, CallStatus, etc.
  router.post("/voice/inbound", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const callSid = typeof body.CallSid === "string" ? body.CallSid : "";
    const from = typeof body.From === "string" ? body.From : "";
    const to = typeof body.To === "string" ? body.To : "";
    const callStatus = typeof body.CallStatus === "string" ? body.CallStatus : "in-progress";

    if (!callSid || !from || !to) {
      res.status(400).set("Content-Type", "application/xml").send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say>Configuration error.</Say><Hangup/></Response>`,
      );
      return;
    }

    // Persist inbound call record. The `to` number is the business phone number
    // (Twilio number), which we treat as the tenant discriminator when no
    // explicit company mapping is configured.
    try {
      await db
        .insert(voiceCallLogs)
        .values({
          companyId: to,
          callSid,
          direction: "inbound",
          from,
          to,
          status: callStatus,
        })
        .onConflictDoNothing();
    } catch (err) {
      logger.error({ err, callSid }, "voice inbound: failed to persist call log");
    }

    const greeting = "Thanks for calling. Please leave a message after the tone.";
    const twiml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<Response>` +
      `<Say voice="Polly.Joanna">${greeting}</Say>` +
      `<Record maxLength="120" playBeep="true" trim="trim-silence"/>` +
      `<Hangup/>` +
      `</Response>`;
    res.set("Content-Type", "application/xml").send(twiml);
  });

  // Trigger an outbound call — requires auth.
  router.post("/voice/outbound", validate(outboundBodySchema), async (req, res) => {
    const { companyId, to, script } = req.body as z.infer<typeof outboundBodySchema>;
    assertCompanyAccess(req, companyId);

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    if (!accountSid || !authToken || !fromNumber) {
      throw badRequest("Voice is not configured: missing TWILIO_* environment variables");
    }

    // Twilio is a transitive dep (shipped by the voice plugin package) and is
    // only required at runtime when an outbound call is placed. Resolve it
    // lazily to keep the server's direct dep set small.
    const twilioModuleName = "twilio";
    const twilioModule = (await import(/* @vite-ignore */ twilioModuleName)) as {
      default: (accountSid: string, authToken: string) => {
        calls: {
          create: (args: { to: string; from: string; twiml: string }) => Promise<{
            sid: string;
            status?: string | null;
          }>;
        };
      };
    };
    const client = twilioModule.default(accountSid, authToken);
    const { buildOutboundTwiml } = await import("@paperclipai/plugin-voice/twilio-handler");
    const twiml = buildOutboundTwiml({ script });
    const call = await client.calls.create({
      to,
      from: fromNumber,
      twiml,
    });

    await db.insert(voiceCallLogs).values({
      companyId,
      callSid: call.sid,
      direction: "outbound",
      from: fromNumber,
      to,
      status: call.status ?? "queued",
      transcript: script,
    });

    res.json({ callSid: call.sid, status: call.status ?? "queued", to, from: fromNumber });
  });

  // Twilio status callback — updates the call log row when call state changes.
  router.post("/voice/status", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const callSid = typeof body.CallSid === "string" ? body.CallSid : "";
    const status = typeof body.CallStatus === "string" ? body.CallStatus : undefined;
    const duration =
      typeof body.CallDuration === "string" && body.CallDuration.length > 0
        ? Number(body.CallDuration)
        : undefined;
    if (!callSid) {
      res.status(204).end();
      return;
    }
    try {
      await db
        .update(voiceCallLogs)
        .set({
          status: status ?? "unknown",
          durationSeconds: Number.isFinite(duration) ? duration : undefined,
          updatedAt: new Date(),
        })
        .where(eq(voiceCallLogs.callSid, callSid));
    } catch (err) {
      logger.error({ err, callSid }, "voice status: failed to update call log");
    }
    res.status(204).end();
  });

  // List call logs for the authenticated company.
  router.get("/voice/logs", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);

    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 50));
    const rows = await db
      .select()
      .from(voiceCallLogs)
      .where(eq(voiceCallLogs.companyId, companyId))
      .orderBy(desc(voiceCallLogs.createdAt))
      .limit(limit);
    res.json({ logs: rows });
  });

  // Aggregate call stats for the authenticated company.
  router.get("/voice/stats", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);

    const rows = await db
      .select({
        direction: voiceCallLogs.direction,
        status: voiceCallLogs.status,
        durationSeconds: voiceCallLogs.durationSeconds,
        createdAt: voiceCallLogs.createdAt,
      })
      .from(voiceCallLogs)
      .where(eq(voiceCallLogs.companyId, companyId));

    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;
    let callsToday = 0;
    let callsThisWeek = 0;
    let totalDuration = 0;
    let completedCount = 0;
    let inboundCalls = 0;
    let outboundCalls = 0;
    let missedCalls = 0;

    for (const row of rows) {
      const age = now - new Date(row.createdAt).getTime();
      if (age <= DAY) callsToday += 1;
      if (age <= 7 * DAY) callsThisWeek += 1;
      const dir = normalizeDirection(row.direction);
      if (dir === "inbound") inboundCalls += 1;
      else outboundCalls += 1;
      if (row.status === "completed") {
        completedCount += 1;
        if (typeof row.durationSeconds === "number") {
          totalDuration += row.durationSeconds;
        }
      }
      if (row.status === "no-answer" || row.status === "busy" || row.status === "failed") {
        missedCalls += 1;
      }
    }

    res.json({
      totalCalls: rows.length,
      callsToday,
      callsThisWeek,
      inboundCalls,
      outboundCalls,
      completedCalls: completedCount,
      missedCalls,
      totalDurationSeconds: totalDuration,
      averageDurationSeconds:
        completedCount > 0 ? Math.round(totalDuration / completedCount) : 0,
    });
  });

  return router;
}

// Silence unused-import warning for `and` / `sql` helpers that are available to
// future extensions (per-day grouping, etc.) without pulling them in on demand.
void and;
void sql;
