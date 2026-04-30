import {
  definePlugin,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";

// ---------------------------------------------------------------------------
// Server base URL resolution
// ---------------------------------------------------------------------------

function getServerBaseUrl(): string {
  const url = process.env.PAPERCLIP_API_URL;
  if (url && url.length > 0) {
    return url.replace(/\/$/, "");
  }
  return "http://localhost:3100";
}

// ---------------------------------------------------------------------------
// Google Workspace not-connected error
// ---------------------------------------------------------------------------

class GoogleNotConnectedError extends Error {
  constructor() {
    super(
      "Google Workspace not connected for this company. Connect at Settings → Integrations.",
    );
    this.name = "GoogleNotConnectedError";
  }
}

class GoogleApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "GoogleApiError";
    this.status = status;
  }
}

// ---------------------------------------------------------------------------
// Internal proxy helpers
// ---------------------------------------------------------------------------

async function serverGet(
  ctx: PluginContext,
  path: string,
  companyId: string,
  extra?: Record<string, string | number | boolean>,
): Promise<unknown> {
  const base = getServerBaseUrl();
  const url = new URL(`${base}/api${path}`);
  url.searchParams.set("companyId", companyId);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      url.searchParams.set(k, String(v));
    }
  }
  const res = await ctx.http.fetch(url.toString(), { method: "GET" });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof json.error === "string" ? json.error : `Google API error (${res.status})`;
    throw new GoogleApiError(msg, res.status);
  }
  return json;
}

async function serverPost(
  ctx: PluginContext,
  path: string,
  body: Record<string, unknown>,
): Promise<unknown> {
  const base = getServerBaseUrl();
  const url = `${base}/api${path}`;
  const res = await ctx.http.fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof json.error === "string" ? json.error : `Google API error (${res.status})`;
    throw new GoogleApiError(msg, res.status);
  }
  return json;
}

// ---------------------------------------------------------------------------
// Auth check
// ---------------------------------------------------------------------------

async function assertConnected(ctx: PluginContext, companyId: string): Promise<void> {
  const result = await serverGet(ctx, "/google/auth/status", companyId);
  const status = result as { connected: boolean };
  if (!status.connected) {
    throw new GoogleNotConnectedError();
  }
}

// ---------------------------------------------------------------------------
// Param helpers
// ---------------------------------------------------------------------------

function extractString(params: unknown, key: string): string | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function extractNumber(params: unknown, key: string): number | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function extractBoolean(params: unknown, key: string): boolean | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

function extractStringArray(params: unknown, key: string): string[] | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (Array.isArray(v)) {
      const arr = v.filter((x): x is string => typeof x === "string");
      if (arr.length > 0) return arr;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Tool error normalisation
// ---------------------------------------------------------------------------

function toolError(err: unknown): ToolResult {
  if (err instanceof GoogleNotConnectedError) {
    return { error: err.message };
  }
  if (err instanceof GoogleApiError) {
    return { error: err.message };
  }
  if (err instanceof Error) {
    return { error: `Google Workspace plugin error: ${err.message}` };
  }
  return { error: `Google Workspace plugin error: ${String(err)}` };
}

// ---------------------------------------------------------------------------
// Plugin definition
// ---------------------------------------------------------------------------

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Google Workspace plugin setup starting");

    // -----------------------------------------------------------------------
    // google_calendar_list_events
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.calendarListEvents,
      {
        displayName: "Google Calendar: List Events",
        description:
          "List upcoming calendar events. Optionally filter by date range, result count, or calendar ID.",
        parametersSchema: {
          type: "object",
          properties: {
            maxResults: { type: "number" },
            timeMin: { type: "string" },
            timeMax: { type: "string" },
            calendarId: { type: "string" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          await assertConnected(ctx, runCtx.companyId);
          const extra: Record<string, string | number | boolean> = {};
          const maxResults = extractNumber(params, "maxResults");
          if (maxResults !== undefined) extra.maxResults = maxResults;
          const timeMin = extractString(params, "timeMin");
          if (timeMin) extra.timeMin = timeMin;
          const timeMax = extractString(params, "timeMax");
          if (timeMax) extra.timeMax = timeMax;
          // calendarId is handled by the server route only as primary; pass as query param
          const result = await serverGet(ctx, "/google/calendar/events", runCtx.companyId, extra);
          const data = result as { events: unknown[] };
          return {
            content: `Found ${data.events?.length ?? 0} calendar event(s).`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_calendar_create_event
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.calendarCreateEvent,
      {
        displayName: "Google Calendar: Create Event",
        description:
          "Create a calendar event with a title, start time, end time, and optional description and attendees.",
        parametersSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            start: { type: "string" },
            end: { type: "string" },
            description: { type: "string" },
            attendees: { type: "array", items: { type: "string" } },
            calendarId: { type: "string" },
          },
          required: ["summary", "start", "end"],
        },
      },
      async (params, runCtx) => {
        const summary = extractString(params, "summary");
        const start = extractString(params, "start");
        const end = extractString(params, "end");
        if (!summary) return { error: "`summary` is required" };
        if (!start) return { error: "`start` is required" };
        if (!end) return { error: "`end` is required" };
        try {
          await assertConnected(ctx, runCtx.companyId);
          const body: Record<string, unknown> = {
            companyId: runCtx.companyId,
            summary,
            start,
            end,
          };
          const description = extractString(params, "description");
          if (description) body.description = description;
          const attendees = extractStringArray(params, "attendees");
          if (attendees) body.attendees = attendees;
          const result = await serverPost(ctx, "/google/calendar/events", body);
          const data = result as { eventId?: string; htmlLink?: string };
          return {
            content: `Created calendar event${data.eventId ? ` (ID: ${data.eventId})` : ""}.`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_drive_list_files
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.driveListFiles,
      {
        displayName: "Google Drive: List Files",
        description:
          "List files in Google Drive. Optionally filter by query string, result limit, or folder ID.",
        parametersSchema: {
          type: "object",
          properties: {
            query: { type: "string" },
            limit: { type: "number" },
            folderId: { type: "string" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          await assertConnected(ctx, runCtx.companyId);
          const extra: Record<string, string | number | boolean> = {};
          const query = extractString(params, "query");
          if (query) extra.q = query;
          const limit = extractNumber(params, "limit");
          if (limit !== undefined) extra.maxResults = limit;
          const folderId = extractString(params, "folderId");
          if (folderId) {
            // Combine with existing q if present
            const folderFilter = `'${folderId}' in parents`;
            extra.q = query ? `${query} and ${folderFilter}` : folderFilter;
          }
          const result = await serverGet(ctx, "/google/drive/files", runCtx.companyId, extra);
          const data = result as { files: unknown[] };
          return {
            content: `Found ${data.files?.length ?? 0} file(s) in Drive.`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_drive_get_file
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.driveGetFile,
      {
        displayName: "Google Drive: Get File",
        description: "Get file metadata and content by Drive file ID.",
        parametersSchema: {
          type: "object",
          properties: {
            fileId: { type: "string" },
          },
          required: ["fileId"],
        },
      },
      async (params, runCtx) => {
        const fileId = extractString(params, "fileId");
        if (!fileId) return { error: "`fileId` is required" };
        try {
          await assertConnected(ctx, runCtx.companyId);
          const result = await serverGet(
            ctx,
            `/google/drive/files/${encodeURIComponent(fileId)}/content`,
            runCtx.companyId,
          );
          const data = result as { name?: string; content?: string };
          return {
            content: `Fetched file${data.name ? ` "${data.name}"` : ""} from Drive.`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_gmail_list_threads
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.gmailListThreads,
      {
        displayName: "Gmail: List Threads",
        description:
          "List recent email threads. Optionally limit results or filter to unread only.",
        parametersSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            unreadOnly: { type: "boolean" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          await assertConnected(ctx, runCtx.companyId);
          const extra: Record<string, string | number | boolean> = {};
          const limit = extractNumber(params, "limit");
          if (limit !== undefined) extra.maxResults = limit;
          const unreadOnly = extractBoolean(params, "unreadOnly");
          if (unreadOnly) extra.q = "is:unread";
          const result = await serverGet(ctx, "/google/gmail/threads", runCtx.companyId, extra);
          const data = result as { threads: unknown[] };
          return {
            content: `Found ${data.threads?.length ?? 0} Gmail thread(s).`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_gmail_send
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.gmailSend,
      {
        displayName: "Gmail: Send Email",
        description: "Send an email via Gmail.",
        parametersSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
            cc: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
      },
      async (params, runCtx) => {
        const to = extractString(params, "to");
        const subject = extractString(params, "subject");
        const body = extractString(params, "body");
        if (!to) return { error: "`to` is required" };
        if (!subject) return { error: "`subject` is required" };
        if (!body) return { error: "`body` is required" };
        try {
          await assertConnected(ctx, runCtx.companyId);
          const requestBody: Record<string, unknown> = {
            companyId: runCtx.companyId,
            to,
            subject,
            body,
          };
          const cc = extractString(params, "cc");
          if (cc) requestBody.cc = cc;
          const result = await serverPost(ctx, "/google/gmail/send", requestBody);
          const data = result as { messageId?: string; threadId?: string };
          return {
            content: `Email sent to ${to}${data.messageId ? ` (message ID: ${data.messageId})` : ""}.`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_gmail_draft
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.gmailDraft,
      {
        displayName: "Gmail: Create Draft",
        description: "Create a draft email in Gmail without sending it.",
        parametersSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            subject: { type: "string" },
            body: { type: "string" },
          },
          required: ["to", "subject", "body"],
        },
      },
      async (params, runCtx) => {
        const to = extractString(params, "to");
        const subject = extractString(params, "subject");
        const body = extractString(params, "body");
        if (!to) return { error: "`to` is required" };
        if (!subject) return { error: "`subject` is required" };
        if (!body) return { error: "`body` is required" };
        try {
          await assertConnected(ctx, runCtx.companyId);
          const result = await serverPost(ctx, "/google/gmail/draft", {
            companyId: runCtx.companyId,
            to,
            subject,
            body,
          });
          const data = result as { draftId?: string };
          return {
            content: `Draft created${data.draftId ? ` (draft ID: ${data.draftId})` : ""}.`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_docs_create
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.docsCreate,
      {
        displayName: "Google Docs: Create Document",
        description: "Create a new Google Doc with an optional initial content body.",
        parametersSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            content: { type: "string" },
          },
          required: ["title"],
        },
      },
      async (params, runCtx) => {
        const title = extractString(params, "title");
        if (!title) return { error: "`title` is required" };
        try {
          await assertConnected(ctx, runCtx.companyId);
          const requestBody: Record<string, unknown> = {
            companyId: runCtx.companyId,
            title,
          };
          const content = extractString(params, "content");
          if (content) requestBody.content = content;
          const result = await serverPost(ctx, "/google/docs/create", requestBody);
          const data = result as { docId?: string; url?: string };
          return {
            content: `Created Google Doc "${title}"${data.url ? `: ${data.url}` : ""}.`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // google_sheets_list
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.sheetsList,
      {
        displayName: "Google Sheets: List Spreadsheets",
        description:
          "List spreadsheets in Google Drive, optionally limited to a result count.",
        parametersSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          await assertConnected(ctx, runCtx.companyId);
          const extra: Record<string, string | number | boolean> = {
            // Filter Drive files to Sheets mime type
            q: "mimeType='application/vnd.google-apps.spreadsheet'",
          };
          const limit = extractNumber(params, "limit");
          if (limit !== undefined) extra.maxResults = limit;
          const result = await serverGet(ctx, "/google/drive/files", runCtx.companyId, extra);
          const data = result as { files: unknown[] };
          return {
            content: `Found ${data.files?.length ?? 0} spreadsheet(s).`,
            data,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.logger.info("Google Workspace plugin setup complete");
  },

  async onHealth() {
    const apiUrl = process.env.PAPERCLIP_API_URL;
    if (!apiUrl || apiUrl.length === 0) {
      return {
        status: "degraded",
        message:
          "PAPERCLIP_API_URL is not set; Google Workspace plugin will attempt localhost:3100.",
      };
    }
    return {
      status: "ok",
      message: `Google Workspace plugin configured. Server: ${apiUrl}`,
    };
  },
});

export default plugin;
