import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.google-workspace";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  calendarListEvents: "google_calendar_list_events",
  calendarCreateEvent: "google_calendar_create_event",
  driveListFiles: "google_drive_list_files",
  driveGetFile: "google_drive_get_file",
  gmailListThreads: "google_gmail_list_threads",
  gmailSend: "google_gmail_send",
  gmailDraft: "google_gmail_draft",
  docsCreate: "google_docs_create",
  sheetsList: "google_sheets_list",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Google Workspace",
  description:
    "Gmail, Google Calendar, Drive, Docs and Sheets — one connection for all Google services.",
  author: "Avero AI",
  categories: ["connector", "automation"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "http.outbound",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.calendarListEvents,
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
    {
      name: TOOL_NAMES.calendarCreateEvent,
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
    {
      name: TOOL_NAMES.driveListFiles,
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
    {
      name: TOOL_NAMES.driveGetFile,
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
    {
      name: TOOL_NAMES.gmailListThreads,
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
    {
      name: TOOL_NAMES.gmailSend,
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
    {
      name: TOOL_NAMES.gmailDraft,
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
    {
      name: TOOL_NAMES.docsCreate,
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
    {
      name: TOOL_NAMES.sheetsList,
      displayName: "Google Sheets: List Spreadsheets",
      description: "List spreadsheets in Google Drive, optionally limited to a result count.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
  ],
};

export default manifest;
