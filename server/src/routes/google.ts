// Register in server/src/app.ts:
// import { googleRoutes } from "./routes/google.js";
// api.use(googleRoutes(db));   // after line 288 (knowledgeRoutes)

import { Router, type Request, type Response } from "express";
import { google } from "googleapis";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess } from "./authz.js";
import {
  createGoogleOAuth2Client,
  getAuthorizedGoogleClient,
  getGoogleTokens,
  storeGoogleTokens,
  deleteGoogleTokens,
  type GoogleTokens,
} from "../services/google-oauth.js";

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/userinfo.email",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getCompanyIdFromQuery(req: Request): string {
  const raw = req.query.companyId;
  if (typeof raw !== "string" || raw.length === 0) {
    throw Object.assign(new Error("companyId query param is required"), { status: 400 });
  }
  return raw;
}

function apiError(res: Response, e: unknown, label: string): void {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`[google] ${label}:`, e);
  res.status(503).json({ error: "Google API error", details: msg });
}

/**
 * Decode a base64url or base64 encoded Gmail message part body.
 */
function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

type MimePart = {
  mimeType?: string | null;
  body?: { data?: string | null } | null;
  parts?: MimePart[] | null;
};

/**
 * Recursively walk a MIME part tree and collect the first text body.
 */
function extractBody(payload: MimePart | null | undefined): string {
  if (!payload) return "";

  if (payload.body?.data) {
    const mime = payload.mimeType ?? "";
    if (mime.startsWith("text/plain") || mime.startsWith("text/html")) {
      return decodeBase64(payload.body.data);
    }
  }

  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      const text = extractBody(part);
      if (text) return text;
    }
  }

  return "";
}

function headerValue(
  headers: Array<{ name?: string | null; value?: string | null }> | null | undefined,
  name: string,
): string {
  if (!headers) return "";
  return (
    headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? ""
  );
}

/** Build a base64url-encoded RFC 2822 message. */
function buildRawEmail(opts: {
  to: string;
  subject: string;
  body: string;
  replyToMessageId?: string;
  threadId?: string;
}): string {
  const headers = [
    `To: ${opts.to}`,
    `Subject: ${opts.subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
  ];
  if (opts.replyToMessageId) {
    headers.push(`In-Reply-To: ${opts.replyToMessageId}`);
    headers.push(`References: ${opts.replyToMessageId}`);
  }
  return Buffer.from(headers.join("\r\n") + "\r\n\r\n" + opts.body)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function googleRoutes(_db: Db) {
  const router = Router();

  // =========================================================================
  // OAuth
  // =========================================================================

  // GET /google/auth/connect?companyId=xxx
  router.get("/google/auth/connect", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    try {
      const client = createGoogleOAuth2Client();
      const url = client.generateAuthUrl({
        access_type: "offline",
        scope: GOOGLE_SCOPES,
        prompt: "consent",
        state: companyId,
      });
      res.redirect(url);
    } catch (e) {
      apiError(res, e, "auth/connect");
    }
  });

  // GET /google/auth/callback — no auth, Google redirects here directly
  router.get("/google/auth/callback", async (req: Request, res: Response) => {
    const code = req.query.code;
    const state = req.query.state;

    if (typeof code !== "string" || !code) {
      res.status(400).json({ error: "Missing authorization code from Google" });
      return;
    }
    if (typeof state !== "string" || !state) {
      res.status(400).json({ error: "Missing state (companyId) in OAuth callback" });
      return;
    }

    const companyId = state;

    try {
      const client = createGoogleOAuth2Client();
      const { tokens } = await client.getToken(code);

      if (!tokens.access_token || !tokens.refresh_token) {
        res.status(502).json({ error: "Google did not return expected tokens" });
        return;
      }

      client.setCredentials(tokens);
      const oauth2 = google.oauth2({ version: "v2", auth: client });
      const userInfo = await oauth2.userinfo.get();
      const email = userInfo.data.email ?? "";

      const stored: GoogleTokens = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: tokens.expiry_date ?? Date.now() + 3600 * 1000,
        email,
        scope: tokens.scope ?? GOOGLE_SCOPES.join(" "),
      };

      await storeGoogleTokens(companyId, stored);
      res.redirect("/integrations");
    } catch (e) {
      apiError(res, e, "auth/callback");
    }
  });

  // GET /google/auth/status?companyId=xxx
  router.get("/google/auth/status", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    try {
      const tokens = await getGoogleTokens(companyId);
      if (!tokens) {
        res.json({ connected: false });
        return;
      }
      res.json({ connected: true, email: tokens.email });
    } catch (e) {
      apiError(res, e, "auth/status");
    }
  });

  // DELETE /google/auth/disconnect?companyId=xxx
  router.delete("/google/auth/disconnect", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    try {
      const tokens = await getGoogleTokens(companyId);
      if (tokens) {
        const client = createGoogleOAuth2Client();
        try {
          await client.revokeToken(tokens.accessToken);
        } catch (revokeErr) {
          console.error("[google] token revoke failed (continuing):", revokeErr);
        }
      }
      await deleteGoogleTokens(companyId);
      res.json({ disconnected: true });
    } catch (e) {
      apiError(res, e, "auth/disconnect");
    }
  });

  // =========================================================================
  // Gmail
  // =========================================================================

  // GET /google/gmail/threads?companyId=xxx&maxResults=20&q=...
  router.get("/google/gmail/threads", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const gmail = google.gmail({ version: "v1", auth });

      const maxResults = Math.min(100, Math.max(1, Number(req.query.maxResults ?? 20)));
      const q = typeof req.query.q === "string" ? req.query.q : undefined;

      const listRes = await gmail.users.threads.list({
        userId: "me",
        maxResults,
        ...(q ? { q } : {}),
      });

      const threadItems = listRes.data.threads ?? [];

      // Fetch full data for first 5 to get subjects/snippets
      const detailedResults = await Promise.all(
        threadItems.slice(0, 5).map((t) =>
          gmail.users.threads.get({ userId: "me", id: t.id! }),
        ),
      );

      const detailedMap = new Map(
        detailedResults.map((r) => [r.data.id, r.data]),
      );

      const threads = threadItems.map((t) => {
        const full = detailedMap.get(t.id!);
        const firstMsg = full?.messages?.[0];
        const hdrs = firstMsg?.payload?.headers;
        return {
          id: t.id,
          snippet: t.snippet ?? full?.snippet ?? "",
          subject: headerValue(hdrs, "Subject"),
          from: headerValue(hdrs, "From"),
          date: headerValue(hdrs, "Date"),
          messageCount: full?.messages?.length ?? 1,
        };
      });

      res.json({ threads });
    } catch (e) {
      apiError(res, e, "gmail/threads");
    }
  });

  // GET /google/gmail/threads/:threadId?companyId=xxx
  router.get("/google/gmail/threads/:threadId", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const threadId = String(req.params.threadId);

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const gmail = google.gmail({ version: "v1", auth });

      const threadRes = await gmail.users.threads.get({
        userId: "me",
        id: threadId,
        format: "full",
      });

      const messages = (threadRes.data.messages ?? []).map((msg) => {
        const hdrs = msg.payload?.headers;
        const payload = msg.payload as MimePart | undefined;
        return {
          id: msg.id,
          from: headerValue(hdrs, "From"),
          to: headerValue(hdrs, "To"),
          subject: headerValue(hdrs, "Subject"),
          date: headerValue(hdrs, "Date"),
          body: extractBody(payload),
        };
      });

      res.json({ id: threadId, messages });
    } catch (e) {
      apiError(res, e, "gmail/threads/:threadId");
    }
  });

  // POST /google/gmail/draft
  router.post("/google/gmail/draft", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const to = typeof body.to === "string" ? body.to : "";
    const subject = typeof body.subject === "string" ? body.subject : "";
    const msgBody = typeof body.body === "string" ? body.body : "";
    const replyToMessageId =
      typeof body.replyToMessageId === "string" ? body.replyToMessageId : undefined;

    if (!to || !subject) {
      res.status(400).json({ error: "to and subject are required" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const gmail = google.gmail({ version: "v1", auth });

      const raw = buildRawEmail({ to, subject, body: msgBody, replyToMessageId });

      const draft = await gmail.users.drafts.create({
        userId: "me",
        requestBody: { message: { raw } },
      });

      res.json({ draftId: draft.data.id });
    } catch (e) {
      apiError(res, e, "gmail/draft");
    }
  });

  // POST /google/gmail/send
  router.post("/google/gmail/send", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const to = typeof body.to === "string" ? body.to : "";
    const subject = typeof body.subject === "string" ? body.subject : "";
    const msgBody = typeof body.body === "string" ? body.body : "";
    const replyToMessageId =
      typeof body.replyToMessageId === "string" ? body.replyToMessageId : undefined;
    const threadId = typeof body.threadId === "string" ? body.threadId : undefined;

    if (!to || !subject) {
      res.status(400).json({ error: "to and subject are required" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const gmail = google.gmail({ version: "v1", auth });

      const raw = buildRawEmail({ to, subject, body: msgBody, replyToMessageId });

      const sent = await gmail.users.messages.send({
        userId: "me",
        requestBody: {
          raw,
          ...(threadId ? { threadId } : {}),
        },
      });

      res.json({ messageId: sent.data.id, threadId: sent.data.threadId });
    } catch (e) {
      apiError(res, e, "gmail/send");
    }
  });

  // =========================================================================
  // Calendar
  // =========================================================================

  // GET /google/calendar/events?companyId=xxx&maxResults=10&days=7
  router.get("/google/calendar/events", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const calendar = google.calendar({ version: "v3", auth });

      const maxResults = Math.min(100, Math.max(1, Number(req.query.maxResults ?? 10)));
      const days = Math.max(1, Number(req.query.days ?? 7));
      const now = new Date();
      const timeMax = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

      const eventsRes = await calendar.events.list({
        calendarId: "primary",
        timeMin: now.toISOString(),
        timeMax: timeMax.toISOString(),
        maxResults,
        singleEvents: true,
        orderBy: "startTime",
      });

      const events = (eventsRes.data.items ?? []).map((e) => ({
        id: e.id,
        summary: e.summary ?? "",
        description: e.description ?? "",
        start: e.start?.dateTime ?? e.start?.date ?? null,
        end: e.end?.dateTime ?? e.end?.date ?? null,
        attendees: (e.attendees ?? []).map((a) => ({
          email: a.email,
          displayName: a.displayName,
          responseStatus: a.responseStatus,
        })),
        meetLink: e.hangoutLink ?? null,
      }));

      res.json({ events });
    } catch (e) {
      apiError(res, e, "calendar/events GET");
    }
  });

  // POST /google/calendar/events
  router.post("/google/calendar/events", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const summary = typeof body.summary === "string" ? body.summary : "";
    const description =
      typeof body.description === "string" ? body.description : undefined;
    const start = typeof body.start === "string" ? body.start : "";
    const end = typeof body.end === "string" ? body.end : "";
    const attendees = Array.isArray(body.attendees) ? (body.attendees as string[]) : [];
    const addMeetLink = body.addMeetLink === true;

    if (!summary || !start || !end) {
      res.status(400).json({ error: "summary, start, and end are required" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const calendar = google.calendar({ version: "v3", auth });

      const requestBody: {
        summary: string;
        description?: string;
        start: { dateTime: string };
        end: { dateTime: string };
        attendees: { email: string }[];
        conferenceData?: { createRequest: { requestId: string } };
      } = {
        summary,
        description,
        start: { dateTime: start },
        end: { dateTime: end },
        attendees: attendees.map((email) => ({ email })),
      };

      if (addMeetLink) {
        requestBody.conferenceData = {
          createRequest: { requestId: Math.random().toString(36).slice(2) },
        };
      }

      const created = await calendar.events.insert({
        calendarId: "primary",
        requestBody,
        ...(addMeetLink ? { conferenceDataVersion: 1 } : {}),
      });

      res.json({
        eventId: created.data.id,
        htmlLink: created.data.htmlLink,
        meetLink: created.data.hangoutLink ?? null,
      });
    } catch (e) {
      apiError(res, e, "calendar/events POST");
    }
  });

  // GET /google/calendar/freebusy?companyId=xxx&emails=a@b.com,c@d.com&timeMin=...&timeMax=...
  router.get("/google/calendar/freebusy", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const emailsRaw = req.query.emails;
    const emails: string[] = Array.isArray(emailsRaw)
      ? (emailsRaw as string[])
      : typeof emailsRaw === "string"
      ? emailsRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const timeMin =
      typeof req.query.timeMin === "string"
        ? req.query.timeMin
        : new Date().toISOString();
    const timeMax =
      typeof req.query.timeMax === "string"
        ? req.query.timeMax
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const calendar = google.calendar({ version: "v3", auth });

      const freebusyRes = await calendar.freebusy.query({
        requestBody: {
          timeMin,
          timeMax,
          items: emails.map((email) => ({ id: email })),
        },
      });

      res.json({ calendars: freebusyRes.data.calendars ?? {} });
    } catch (e) {
      apiError(res, e, "calendar/freebusy");
    }
  });

  // =========================================================================
  // Google Docs
  // =========================================================================

  // POST /google/docs/create
  router.post("/google/docs/create", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const title = typeof body.title === "string" ? body.title : "Untitled Document";
    const content = typeof body.content === "string" ? body.content : "";

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const docs = google.docs({ version: "v1", auth });

      const created = await docs.documents.create({
        requestBody: { title },
      });
      const docId = created.data.documentId ?? "";

      if (content && docId) {
        await docs.documents.batchUpdate({
          documentId: docId,
          requestBody: {
            requests: [
              {
                insertText: {
                  location: { index: 1 },
                  text: content,
                },
              },
            ],
          },
        });
      }

      res.json({ docId, url: `https://docs.google.com/document/d/${docId}/edit` });
    } catch (e) {
      apiError(res, e, "docs/create");
    }
  });

  // POST /google/docs/:docId/append
  router.post("/google/docs/:docId/append", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const docId = String(req.params.docId);
    const content = typeof body.content === "string" ? body.content : "";

    if (!content) {
      res.status(400).json({ error: "content is required" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const docs = google.docs({ version: "v1", auth });

      const docRes = await docs.documents.get({ documentId: docId });
      const bodyContent = docRes.data.body?.content ?? [];
      const lastElem = bodyContent[bodyContent.length - 1];
      const endIndex = lastElem?.endIndex ?? 1;

      await docs.documents.batchUpdate({
        documentId: docId,
        requestBody: {
          requests: [
            {
              insertText: {
                location: { index: Math.max(1, endIndex - 1) },
                text: content,
              },
            },
          ],
        },
      });

      res.json({ appended: true });
    } catch (e) {
      apiError(res, e, "docs/:docId/append");
    }
  });

  // GET /google/docs/:docId?companyId=xxx
  router.get("/google/docs/:docId", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const docId = String(req.params.docId);

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const docs = google.docs({ version: "v1", auth });

      const docRes = await docs.documents.get({ documentId: docId });

      let plainText = "";
      for (const elem of docRes.data.body?.content ?? []) {
        for (const pe of elem.paragraph?.elements ?? []) {
          plainText += pe.textRun?.content ?? "";
        }
      }

      res.json({ title: docRes.data.title ?? "", content: plainText });
    } catch (e) {
      apiError(res, e, "docs/:docId GET");
    }
  });

  // =========================================================================
  // Google Sheets
  // =========================================================================

  // POST /google/sheets/create
  router.post("/google/sheets/create", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const title =
      typeof body.title === "string" ? body.title : "Untitled Spreadsheet";
    const headers = Array.isArray(body.headers) ? (body.headers as string[]) : [];

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const sheets = google.sheets({ version: "v4", auth });

      const created = await sheets.spreadsheets.create({
        requestBody: { properties: { title } },
      });
      const spreadsheetId = created.data.spreadsheetId ?? "";

      if (headers.length > 0 && spreadsheetId) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: "A1",
          valueInputOption: "RAW",
          requestBody: { values: [headers] },
        });
      }

      res.json({
        spreadsheetId,
        url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
      });
    } catch (e) {
      apiError(res, e, "sheets/create");
    }
  });

  // GET /google/sheets/:spreadsheetId?companyId=xxx&range=Sheet1!A1:Z
  router.get("/google/sheets/:spreadsheetId", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const spreadsheetId = String(req.params.spreadsheetId);
    const range =
      typeof req.query.range === "string" ? req.query.range : "A:Z";

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const sheets = google.sheets({ version: "v4", auth });

      const dataRes = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      res.json({ values: dataRes.data.values ?? [] });
    } catch (e) {
      apiError(res, e, "sheets/:spreadsheetId GET");
    }
  });

  // POST /google/sheets/:spreadsheetId/append
  router.post("/google/sheets/:spreadsheetId/append", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const spreadsheetId = String(req.params.spreadsheetId);
    const range = typeof body.range === "string" ? body.range : "A:A";
    const values = Array.isArray(body.values) ? (body.values as unknown[][]) : [];

    if (values.length === 0) {
      res.status(400).json({ error: "values array is required and must not be empty" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const sheets = google.sheets({ version: "v4", auth });

      const appendRes = await sheets.spreadsheets.values.append({
        spreadsheetId,
        range,
        valueInputOption: "RAW",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values },
      });

      res.json({
        updatedRange: appendRes.data.updates?.updatedRange,
        updatedRows: appendRes.data.updates?.updatedRows,
      });
    } catch (e) {
      apiError(res, e, "sheets/:spreadsheetId/append");
    }
  });

  // =========================================================================
  // Google Drive
  // =========================================================================

  // GET /google/drive/files?companyId=xxx&q=...&mimeType=...&maxResults=20
  router.get("/google/drive/files", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const drive = google.drive({ version: "v3", auth });

      const maxResults = Math.min(
        100,
        Math.max(1, Number(req.query.maxResults ?? 20)),
      );
      const qParts: string[] = [];
      if (typeof req.query.q === "string" && req.query.q) {
        qParts.push(req.query.q);
      }
      if (typeof req.query.mimeType === "string" && req.query.mimeType) {
        qParts.push(`mimeType='${req.query.mimeType}'`);
      }

      const filesRes = await drive.files.list({
        pageSize: maxResults,
        q: qParts.length > 0 ? qParts.join(" and ") : undefined,
        fields: "files(id,name,mimeType,webViewLink,modifiedTime)",
        orderBy: "modifiedTime desc",
      });

      const files = (filesRes.data.files ?? []).map((f) => ({
        id: f.id,
        name: f.name,
        mimeType: f.mimeType,
        webViewLink: f.webViewLink,
        modifiedTime: f.modifiedTime,
      }));

      res.json({ files });
    } catch (e) {
      apiError(res, e, "drive/files GET");
    }
  });

  // GET /google/drive/files/:fileId/content?companyId=xxx
  router.get("/google/drive/files/:fileId/content", async (req: Request, res: Response) => {
    const companyId = getCompanyIdFromQuery(req);
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const fileId = String(req.params.fileId);

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const drive = google.drive({ version: "v3", auth });

      // Get file metadata to determine mimeType
      const meta = await drive.files.get({
        fileId,
        fields: "name,mimeType",
      });
      const mimeType = meta.data.mimeType ?? "";
      const name = meta.data.name ?? fileId;

      let content = "";

      if (mimeType.startsWith("application/vnd.google-apps")) {
        // Google Workspace native type — export as plain text
        const exported = await drive.files.export(
          { fileId, mimeType: "text/plain" },
          { responseType: "text" },
        );
        content =
          typeof exported.data === "string" ? exported.data : String(exported.data);
      } else {
        // Binary/other — download as media text
        const downloaded = await drive.files.get(
          { fileId, alt: "media" },
          { responseType: "text" },
        );
        content =
          typeof downloaded.data === "string"
            ? downloaded.data
            : String(downloaded.data);
      }

      res.json({ name, content });
    } catch (e) {
      apiError(res, e, "drive/files/:fileId/content");
    }
  });

  // POST /google/drive/upload
  router.post("/google/drive/upload", async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = typeof body.companyId === "string" ? body.companyId : "";
    if (!companyId) {
      res.status(400).json({ error: "companyId is required in request body" });
      return;
    }
    try {
      assertCompanyAccess(req, companyId);
    } catch (e) {
      res.status(403).json({ error: e instanceof Error ? e.message : "Forbidden" });
      return;
    }

    const name = typeof body.name === "string" ? body.name : "upload.txt";
    const content = typeof body.content === "string" ? body.content : "";
    const mimeType =
      typeof body.mimeType === "string" ? body.mimeType : "text/plain";
    const folderId =
      typeof body.folderId === "string" ? body.folderId : undefined;

    try {
      const auth = await getAuthorizedGoogleClient(companyId);
      const drive = google.drive({ version: "v3", auth });

      const { Readable } = await import("node:stream");

      const uploaded = await drive.files.create({
        requestBody: {
          name,
          ...(folderId ? { parents: [folderId] } : {}),
        },
        media: {
          mimeType,
          body: Readable.from([content]),
        },
        fields: "id,webViewLink",
      });

      res.json({
        fileId: uploaded.data.id,
        webViewLink: uploaded.data.webViewLink,
      });
    } catch (e) {
      apiError(res, e, "drive/upload");
    }
  });

  return router;
}
