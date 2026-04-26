// Register in server/src/app.ts:
// import { voiceAiRoutes, voiceAiWebhookRouter } from "./routes/voice-ai.js";
// api.use(voiceAiRoutes(db));
// app.use("/api/voice/webhook", express.urlencoded({ extended: false }), voiceAiWebhookRouter(db));

import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import { badRequest, notFound } from "../errors.js";
import { assertInstanceAdmin, assertCompanyAccess } from "./authz.js";
import { validateTwilioSignature } from "../services/twilio-messaging.js";
import {
  createVoiceSession,
  endVoiceSession,
  generateVoiceReply,
  getVoiceSession,
  listActiveSessions,
} from "../services/voice-ai.js";
import type { Db } from "@paperclipai/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function xmlResponse(res: Response, twiml: string): void {
  res.set("Content-Type", "text/xml").send(twiml);
}

function makeTwiml(inner: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${inner}</Response>`;
}

function say(text: string): string {
  // Escape XML special characters to prevent TwiML injection.
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
  return `<Say voice="Polly.Joanna">${escaped}</Say>`;
}

function gatherBlock(action: string, inner: string): string {
  return (
    `<Gather input="speech" timeout="5" speechTimeout="auto" action="${action}" method="POST">` +
    inner +
    `</Gather>`
  );
}

// ---------------------------------------------------------------------------
// Validated schemas
// ---------------------------------------------------------------------------

const outboundSchema = z.object({
  companyId: z.string().min(1),
  to: z.string().min(1),
  message: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Authenticated routes — mounted under /api via api.use(voiceAiRoutes(db))
// ---------------------------------------------------------------------------

export function voiceAiRoutes(_db: Db): Router {
  const router = Router();

  // GET /voice-ai/status
  router.get("/voice-ai/status", (_req: Request, res: Response) => {
    const hasAccountSid = Boolean(process.env.TWILIO_ACCOUNT_SID);
    const hasAuthToken = Boolean(process.env.TWILIO_AUTH_TOKEN);
    const hasPhoneNumber = Boolean(process.env.TWILIO_PHONE_NUMBER);
    const hasDeepgram = Boolean(process.env.DEEPGRAM_API_KEY);
    const hasElevenLabs = Boolean(process.env.ELEVENLABS_API_KEY);
    const voiceId = process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

    res.json({
      configured: hasAccountSid && hasAuthToken && hasPhoneNumber,
      twilio: { accountSid: hasAccountSid, authToken: hasAuthToken, phoneNumber: hasPhoneNumber },
      deepgram: hasDeepgram,
      elevenLabs: { configured: hasElevenLabs, voiceId },
    });
  });

  // GET /voice-ai/sessions — instance admin only
  router.get("/voice-ai/sessions", (req: Request, res: Response) => {
    assertInstanceAdmin(req);
    const sessions = listActiveSessions();
    res.json({ sessions });
  });

  // POST /voice-ai/outbound
  router.post(
    "/voice-ai/outbound",
    validate(outboundSchema),
    async (req: Request, res: Response) => {
      const { companyId, to, message } = req.body as z.infer<typeof outboundSchema>;
      assertCompanyAccess(req, companyId);

      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        res.status(503).json({
          error:
            "Voice is not configured: missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER",
        });
        return;
      }

      // Build inline TwiML — no hosted TwiML bin required.
      const twiml = makeTwiml(say(message));

      const params = new URLSearchParams({
        To: to,
        From: fromNumber,
        Twiml: twiml,
      });

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Calls.json`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization:
            "Basic " + Buffer.from(`${accountSid}:${authToken}`).toString("base64"),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        logger.error({ to, errBody, status: response.status }, "voice-ai: outbound call failed");
        res.status(502).json({
          error: "Twilio outbound call failed",
          details: errBody,
        });
        return;
      }

      const data = (await response.json()) as { sid: string; status?: string | null };
      res.json({ callSid: data.sid, status: data.status ?? "queued", to, from: fromNumber });
    },
  );

  // DELETE /voice-ai/sessions/:callSid — instance admin only
  router.delete("/voice-ai/sessions/:callSid", (req: Request, res: Response) => {
    assertInstanceAdmin(req);
    const callSid = req.params.callSid as string;
    if (!callSid) throw badRequest("callSid is required");
    const session = getVoiceSession(callSid);
    if (!session) throw notFound(`Session ${callSid} not found`);
    endVoiceSession(callSid);
    res.status(204).end();
  });

  return router;
}

// ---------------------------------------------------------------------------
// Twilio webhook router — mounted at /api/voice/webhook (no auth, form-encoded)
// ---------------------------------------------------------------------------

export function voiceAiWebhookRouter(_db: Db): Router {
  const router = Router();

  const isDev = process.env.NODE_ENV !== "production";

  function verifyTwilioSignature(req: Request): boolean {
    if (isDev) return true;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken) return false;
    const rawSig = req.headers["x-twilio-signature"];
    const signature = Array.isArray(rawSig) ? rawSig[0] : rawSig;
    if (typeof signature !== "string" || !signature) return false;
    const host = req.get("host") ?? "";
    const url = `${req.protocol}://${host}${req.originalUrl}`;
    const params = (req.body ?? {}) as Record<string, string>;
    return validateTwilioSignature(authToken, signature, url, params);
  }

  // POST /inbound — Twilio calls this when a call arrives
  router.post("/inbound", async (req: Request, res: Response) => {
    if (!verifyTwilioSignature(req)) {
      res.status(403).set("Content-Type", "text/xml").send(
        makeTwiml(`${say("Forbidden.")}` + "<Hangup/>"),
      );
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const callSid = typeof body.CallSid === "string" ? body.CallSid : "";
    const from = typeof body.From === "string" ? body.From : "unknown";
    const companyId =
      process.env.TWILIO_DEFAULT_COMPANY_ID ??
      (typeof body.To === "string" ? body.To : "default");

    if (!callSid) {
      xmlResponse(
        res,
        makeTwiml(`${say("Configuration error.")}` + "<Hangup/>"),
      );
      return;
    }

    createVoiceSession(callSid, companyId, from);

    const twiml = makeTwiml(
      say("Thank you for calling. I'm your AI assistant. How can I help you today?") +
        gatherBlock(
          "/api/voice/webhook/gather",
          say("Please go ahead and speak."),
        ),
    );

    xmlResponse(res, twiml);
  });

  // POST /gather — Twilio calls this after the caller speaks
  router.post("/gather", async (req: Request, res: Response) => {
    if (!verifyTwilioSignature(req)) {
      res.status(403).set("Content-Type", "text/xml").send(
        makeTwiml(`${say("Forbidden.")}` + "<Hangup/>"),
      );
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const callSid = typeof body.CallSid === "string" ? body.CallSid : "";
    const speechResult =
      typeof body.SpeechResult === "string" ? body.SpeechResult.trim() : "";

    if (!callSid) {
      xmlResponse(res, makeTwiml(say("Sorry, something went wrong.") + "<Hangup/>"));
      return;
    }

    const session = getVoiceSession(callSid);
    if (!session) {
      // Session not found — greet again so the call recovers gracefully.
      const twiml = makeTwiml(
        say("I lost track of our conversation. Let me start over.") +
          gatherBlock("/api/voice/webhook/gather", say("How can I help you?")),
      );
      xmlResponse(res, twiml);
      return;
    }

    if (!speechResult) {
      // No speech detected — prompt again without burning a generation.
      const twiml = makeTwiml(
        say("I didn't catch that.") +
          gatherBlock(
            "/api/voice/webhook/gather",
            say("Could you please repeat that?"),
          ) +
          "<Hangup/>",
      );
      xmlResponse(res, twiml);
      return;
    }

    // Append caller utterance, then generate and append the AI reply.
    session.transcript.push(speechResult);
    const reply = await generateVoiceReply(session, speechResult);
    session.transcript.push(reply);

    const twiml = makeTwiml(
      say(reply) +
        gatherBlock(
          "/api/voice/webhook/gather",
          say("Anything else I can help you with?"),
        ) +
        "<Hangup/>",
    );

    xmlResponse(res, twiml);
  });

  // POST /status — Twilio status callback
  router.post("/status", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const callSid = typeof body.CallSid === "string" ? body.CallSid : "";
    const callStatus = typeof body.CallStatus === "string" ? body.CallStatus : "";

    if (callSid && (callStatus === "completed" || callStatus === "failed")) {
      endVoiceSession(callSid);
    }

    res.status(200).end();
  });

  return router;
}
