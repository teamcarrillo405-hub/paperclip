// Register in server/src/app.ts:
// import { realtimeMeetingRoutes } from "./routes/realtime-meeting.js";
// api.use(realtimeMeetingRoutes(db));
// Also add to createApp: createMeetingWebSocketServer(server, db)
// Import: import { createMeetingWebSocketServer } from "./realtime/meeting-ws.js";
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  createMeetingSession,
  getMeetingSession,
  listMeetingSessions,
  endMeetingSession,
  recordCreatedIssue,
} from "../services/realtime-transcription.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const createSessionSchema = z.object({
  companyId: z.string().min(1),
  title: z.string().default(""),
});

const endSessionBodySchema = z.object({
  companyId: z.string().min(1),
  createIssues: z.boolean().optional().default(false),
});

// ---------------------------------------------------------------------------
// Helper — resolve companyId from query params
// ---------------------------------------------------------------------------

function resolveCompanyIdFromQuery(req: Request): string {
  const raw = req.query.companyId ?? req.query.company_id;
  if (typeof raw === "string" && raw.length > 0) return raw;
  throw badRequest("companyId query parameter is required");
}

// ---------------------------------------------------------------------------
// Router factory
// ---------------------------------------------------------------------------

export function realtimeMeetingRoutes(db: Db) {
  // db param reserved for future use (e.g. persisting issues via DB)
  void db;

  const router = Router();

  // GET /meeting/status
  router.get("/meeting/status", (_req: Request, res: Response) => {
    const deepgramConfigured = Boolean(
      process.env.DEEPGRAM_API_KEY?.trim(),
    );
    res.json({ deepgramConfigured });
  });

  // POST /meeting/sessions
  router.post(
    "/meeting/sessions",
    validate(createSessionSchema),
    async (req: Request, res: Response) => {
      const { companyId, title } = req.body as z.infer<typeof createSessionSchema>;
      assertCompanyAccess(req, companyId);
      const session = createMeetingSession(companyId, title);
      res.status(201).json({ sessionId: session.id, session });
    },
  );

  // GET /meeting/sessions
  router.get("/meeting/sessions", async (req: Request, res: Response) => {
    const companyId = resolveCompanyIdFromQuery(req);
    assertCompanyAccess(req, companyId);
    const sessions = listMeetingSessions(companyId);
    res.json({ sessions });
  });

  // GET /meeting/sessions/:sessionId
  router.get("/meeting/sessions/:sessionId", async (req: Request, res: Response) => {
    const companyId = resolveCompanyIdFromQuery(req);
    assertCompanyAccess(req, companyId);
    const { sessionId } = req.params as { sessionId: string };
    const session = getMeetingSession(companyId, sessionId);
    if (!session) throw notFound("Meeting session not found");
    res.json({ session });
  });

  // POST /meeting/sessions/:sessionId/end
  router.post(
    "/meeting/sessions/:sessionId/end",
    validate(endSessionBodySchema),
    async (req: Request, res: Response) => {
      const { companyId, createIssues } = req.body as z.infer<typeof endSessionBodySchema>;
      assertCompanyAccess(req, companyId);
      const { sessionId } = req.params as { sessionId: string };

      const sessionBefore = getMeetingSession(companyId, sessionId);
      if (!sessionBefore) throw notFound("Meeting session not found");

      const session = await endMeetingSession(companyId, sessionId);

      if (createIssues && session.actionItems.length > 0) {
        const baseUrl = `${req.protocol}://${req.get("host")}`;
        const headers: HeadersInit = {
          "Content-Type": "application/json",
        };
        // Forward auth header if present
        const authHeader = req.headers.authorization;
        if (authHeader) {
          headers["Authorization"] = authHeader;
        }
        // Forward cookie if present
        const cookieHeader = req.headers.cookie;
        if (cookieHeader) {
          headers["Cookie"] = cookieHeader;
        }

        for (const item of session.actionItems) {
          try {
            const resp = await fetch(
              `${baseUrl}/api/companies/${encodeURIComponent(companyId)}/issues`,
              {
                method: "POST",
                headers,
                body: JSON.stringify({
                  title: item.text.slice(0, 200),
                  description: `Auto-created from meeting: ${session.title}\n\nDetected action item (confidence: ${item.confidence})`,
                  status: "open",
                }),
              },
            );
            if (resp.ok) {
              const data = (await resp.json()) as { issue?: { id?: string }; id?: string };
              const issueId = data.issue?.id ?? data.id ?? "";
              if (issueId) {
                recordCreatedIssue(companyId, sessionId, issueId);
              }
            }
          } catch {
            // best-effort; non-fatal
          }
        }

        // Return updated session with recorded issue IDs
        const updatedSession = getMeetingSession(companyId, sessionId) ?? session;
        return res.json({ session: updatedSession });
      }

      return res.json({ session });
    },
  );

  // GET /meeting/sessions/:sessionId/transcript
  router.get(
    "/meeting/sessions/:sessionId/transcript",
    async (req: Request, res: Response) => {
      const companyId = resolveCompanyIdFromQuery(req);
      assertCompanyAccess(req, companyId);
      const { sessionId } = req.params as { sessionId: string };
      const session = getMeetingSession(companyId, sessionId);
      if (!session) throw notFound("Meeting session not found");
      res
        .set("Content-Type", "text/plain; charset=utf-8")
        .send(session.fullTranscript);
    },
  );

  return router;
}
