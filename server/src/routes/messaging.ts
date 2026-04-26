// Register in server/src/app.ts:
// import { messagingRoutes, messagingWebhookRouter } from "./routes/messaging.js";
// api.use(messagingRoutes(db));
// Also mount the webhook WITHOUT auth middleware:
// app.use("/api/messaging/webhook", express.urlencoded({ extended: false }), messagingWebhookRouter(db));

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest, forbidden, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import { logger } from "../middleware/logger.js";
import {
  findOrCreateThread,
  appendMessage,
  listThreads,
  getThread,
  type MessageChannel,
} from "../services/messaging-store.js";
import {
  sendSms,
  sendWhatsApp,
  validateTwilioSignature,
} from "../services/twilio-messaging.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireTwilioEnv(): void {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN || !process.env.TWILIO_PHONE_NUMBER) {
    const err = new Error(
      "Twilio is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER.",
    );
    (err as NodeJS.ErrnoException & { status?: number }).status = 503;
    throw err;
  }
}

function stripWhatsAppPrefix(phone: string): string {
  return phone.startsWith("whatsapp:") ? phone.slice("whatsapp:".length) : phone;
}

function detectChannel(from: string): MessageChannel {
  return from.startsWith("whatsapp:") ? "whatsapp" : "sms";
}

// ---------------------------------------------------------------------------
// Authenticated routes
// ---------------------------------------------------------------------------

export function messagingRoutes(_db: Db) {
  const router = Router();

  /**
   * GET /messaging/status
   * Returns whether Twilio credentials are configured.
   */
  router.get("/messaging/status", (_req, res) => {
    const configured = Boolean(
      process.env.TWILIO_ACCOUNT_SID &&
        process.env.TWILIO_AUTH_TOKEN &&
        process.env.TWILIO_PHONE_NUMBER,
    );
    res.json({ configured });
  });

  /**
   * GET /messaging/threads?companyId=
   * List all threads for a company, most-recent-first.
   */
  router.get("/messaging/threads", async (req, res) => {
    const companyId = req.query.companyId as string | undefined;
    if (!companyId) throw badRequest("companyId query parameter is required");
    assertCompanyAccess(req, companyId);

    const threads = await listThreads(companyId);
    res.json({ threads });
  });

  /**
   * GET /messaging/threads/:threadId
   * Get a single thread with its full message list.
   */
  router.get("/messaging/threads/:threadId", async (req, res) => {
    const threadId = req.params.threadId as string;
    const thread = await getThread(threadId);
    if (!thread) throw notFound("Thread not found");
    assertCompanyAccess(req, thread.companyId);
    res.json({ thread });
  });

  /**
   * POST /messaging/send
   * Body: { companyId, channel: "sms"|"whatsapp", to, body }
   * Send an outbound message and record it in the thread.
   */
  router.post("/messaging/send", async (req, res) => {
    requireTwilioEnv();

    const { companyId, channel, to, body } = req.body as {
      companyId?: unknown;
      channel?: unknown;
      to?: unknown;
      body?: unknown;
    };

    if (typeof companyId !== "string" || !companyId) {
      throw badRequest("companyId is required");
    }
    if (channel !== "sms" && channel !== "whatsapp") {
      throw badRequest("channel must be 'sms' or 'whatsapp'");
    }
    if (typeof to !== "string" || !to) {
      throw badRequest("to is required");
    }
    if (typeof body !== "string" || !body) {
      throw badRequest("body is required");
    }

    assertCompanyAccess(req, companyId);

    // Normalize the phone number — strip whatsapp: prefix for storage.
    const externalPhone = stripWhatsAppPrefix(to);

    let twilioSid: string;
    if (channel === "whatsapp") {
      const result = await sendWhatsApp(externalPhone, body);
      twilioSid = result.sid;
    } else {
      const result = await sendSms(externalPhone, body);
      twilioSid = result.sid;
    }

    const thread = await findOrCreateThread(companyId, channel, externalPhone);
    const message = await appendMessage(thread.id, {
      direction: "outbound",
      body,
      twilioSid,
      sentAt: new Date().toISOString(),
    });

    res.status(201).json({ thread, message });
  });

  return router;
}

// ---------------------------------------------------------------------------
// Webhook router (mount WITHOUT auth middleware)
// ---------------------------------------------------------------------------

export function messagingWebhookRouter(_db: Db) {
  const router = Router();

  /**
   * POST /inbound
   * Receives inbound SMS / WhatsApp messages from Twilio.
   *
   * Full mount path (as registered in app.ts):
   *   POST /api/messaging/webhook/inbound
   *
   * Twilio sends application/x-www-form-urlencoded.
   * Parse with express.urlencoded({ extended: false }) upstream.
   */
  router.post("/inbound", async (req, res) => {
    const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
    const isDev = process.env.NODE_ENV === "development";

    // -----------------------------------------------------------------------
    // 1. Validate Twilio signature (skip in dev when no auth token is set)
    // -----------------------------------------------------------------------
    if (authToken || !isDev) {
      const signature = (req.headers["x-twilio-signature"] as string | undefined) ?? "";
      const protocol = req.headers["x-forwarded-proto"] ?? req.protocol;
      const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "";
      const fullUrl = `${protocol}://${host}${req.originalUrl}`;
      const params = req.body as Record<string, string>;

      const valid = validateTwilioSignature(authToken, signature, fullUrl, params);
      if (!valid) {
        logger.warn({ url: fullUrl }, "Twilio signature validation failed");
        res.status(403).send("Forbidden");
        return;
      }
    }

    // -----------------------------------------------------------------------
    // 2. Parse Twilio fields
    // -----------------------------------------------------------------------
    const body = req.body as Record<string, string>;
    const rawFrom: string = body["From"] ?? "";
    const messageBody: string = body["Body"] ?? "";
    const messageSid: string = body["MessageSid"] ?? "";

    if (!rawFrom) {
      logger.warn("Twilio inbound webhook missing From field");
      res.set("Content-Type", "text/xml").send("<Response></Response>");
      return;
    }

    const channel = detectChannel(rawFrom);
    const externalPhone = stripWhatsAppPrefix(rawFrom);

    // -----------------------------------------------------------------------
    // 3. Route to the default company
    // -----------------------------------------------------------------------
    const companyId = process.env.TWILIO_DEFAULT_COMPANY_ID ?? "";
    if (!companyId) {
      logger.warn(
        "TWILIO_DEFAULT_COMPANY_ID is not set — inbound message cannot be routed. Set it in .env.",
      );
      res.set("Content-Type", "text/xml").send("<Response></Response>");
      return;
    }

    // -----------------------------------------------------------------------
    // 4. Find or create the conversation thread and append inbound message
    // -----------------------------------------------------------------------
    const thread = await findOrCreateThread(companyId, channel, externalPhone);
    await appendMessage(thread.id, {
      direction: "inbound",
      body: messageBody,
      twilioSid: messageSid,
      sentAt: new Date().toISOString(),
    });

    logger.info(
      { threadId: thread.id, channel, externalPhone, sid: messageSid },
      "Inbound Twilio message recorded",
    );

    // -----------------------------------------------------------------------
    // 5. Call the knowledge/generate endpoint to produce an AI reply
    // -----------------------------------------------------------------------
    let replyText: string | null = null;
    try {
      const port = process.env.PORT ?? "3100";
      const agentRes = await fetch(`http://localhost:${port}/api/knowledge/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          prompt: `Customer ${channel.toUpperCase()}: ${messageBody}\n\nReply briefly and helpfully.`,
          maxTokens: 160,
        }),
      });

      if (agentRes.ok) {
        const agentData = (await agentRes.json()) as { text?: string; content?: string };
        replyText = agentData.text ?? agentData.content ?? null;
      } else {
        logger.warn(
          { status: agentRes.status },
          "knowledge/generate returned non-OK status; skipping AI reply",
        );
      }
    } catch (err) {
      logger.warn({ err }, "Failed to reach knowledge/generate; skipping AI reply");
    }

    // -----------------------------------------------------------------------
    // 6. Send the AI reply back via Twilio and record it as outbound
    // -----------------------------------------------------------------------
    if (replyText) {
      try {
        let twilioSid: string;
        if (channel === "whatsapp") {
          const result = await sendWhatsApp(externalPhone, replyText);
          twilioSid = result.sid;
        } else {
          const result = await sendSms(externalPhone, replyText);
          twilioSid = result.sid;
        }

        await appendMessage(thread.id, {
          direction: "outbound",
          body: replyText,
          twilioSid,
          sentAt: new Date().toISOString(),
        });

        logger.info(
          { threadId: thread.id, channel, sid: twilioSid },
          "AI reply sent via Twilio",
        );
      } catch (err) {
        logger.error({ err }, "Failed to send AI reply via Twilio");
        // Do not surface this error to Twilio — always return 200.
      }
    }

    // -----------------------------------------------------------------------
    // 7. Acknowledge to Twilio with empty TwiML
    // -----------------------------------------------------------------------
    res.set("Content-Type", "text/xml").send("<Response></Response>");
  });

  return router;
}
