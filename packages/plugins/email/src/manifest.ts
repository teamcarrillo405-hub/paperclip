import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.email";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listInbox: "email_list_inbox",
  getMessage: "email_get_message",
  search: "email_search",
  getThread: "email_get_thread",
  send: "email_send",
  draftReply: "email_draft_reply",
  createDraft: "email_create_draft",
  markRead: "email_mark_read",
  moveToFolder: "email_move_to_folder",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Email (Gmail + Outlook)",
  description:
    "Unified email integration supporting Gmail and Microsoft Outlook. Lets agents read, search, draft, and send email with OAuth2 credentials stored per company.",
  author: "Paperclip",
  categories: ["connector", "automation"],
  capabilities: [
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
    "http.outbound",
    "agent.tools.register",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.listInbox,
      displayName: "List Inbox",
      description: "List recent emails from the connected mailbox. Returns summaries (id, from, subject, date, snippet, unread).",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max number of messages (default 20, max 100)" },
          unreadOnly: { type: "boolean", description: "Only return unread messages" },
          folder: { type: "string", description: "Folder/label to read from (default INBOX)" },
        },
      },
    },
    {
      name: TOOL_NAMES.getMessage,
      displayName: "Get Email Message",
      description: "Fetch the full body (plain text) and metadata for a single email message.",
      parametersSchema: {
        type: "object",
        properties: { messageId: { type: "string" } },
        required: ["messageId"],
      },
    },
    {
      name: TOOL_NAMES.search,
      displayName: "Search Email",
      description: "Search the connected mailbox with a provider-native query string.",
      parametersSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          limit: { type: "number" },
        },
        required: ["query"],
      },
    },
    {
      name: TOOL_NAMES.getThread,
      displayName: "Get Email Thread",
      description: "Fetch an entire email thread (all messages in the conversation).",
      parametersSchema: {
        type: "object",
        properties: { threadId: { type: "string" } },
        required: ["threadId"],
      },
    },
    {
      name: TOOL_NAMES.send,
      displayName: "Send Email",
      description:
        "Send an email from the connected mailbox. Requires explicit { confirmed: true } — agents must pass this safety flag to actually send.",
      parametersSchema: {
        type: "object",
        properties: {
          to: { type: "array", items: { type: "string" } },
          subject: { type: "string" },
          body: { type: "string" },
          cc: { type: "array", items: { type: "string" } },
          replyToMessageId: { type: "string" },
          confirmed: { type: "boolean", description: "Must be true to actually send" },
        },
        required: ["to", "subject", "body", "confirmed"],
      },
    },
    {
      name: TOOL_NAMES.draftReply,
      displayName: "Draft Email Reply",
      description:
        "Create a draft reply to an existing message. Does NOT send — a human must approve the draft before it is sent.",
      parametersSchema: {
        type: "object",
        properties: {
          messageId: { type: "string" },
          draftBody: { type: "string" },
        },
        required: ["messageId", "draftBody"],
      },
    },
    {
      name: TOOL_NAMES.createDraft,
      displayName: "Create Email Draft",
      description: "Create a new email draft (not sent).",
      parametersSchema: {
        type: "object",
        properties: {
          to: { type: "array", items: { type: "string" } },
          subject: { type: "string" },
          body: { type: "string" },
          cc: { type: "array", items: { type: "string" } },
        },
        required: ["to", "subject", "body"],
      },
    },
    {
      name: TOOL_NAMES.markRead,
      displayName: "Mark Email as Read",
      description: "Mark a single email message as read.",
      parametersSchema: {
        type: "object",
        properties: { messageId: { type: "string" } },
        required: ["messageId"],
      },
    },
    {
      name: TOOL_NAMES.moveToFolder,
      displayName: "Move Email to Folder",
      description: "Move a message to the named folder/label.",
      parametersSchema: {
        type: "object",
        properties: {
          messageId: { type: "string" },
          folder: { type: "string" },
        },
        required: ["messageId", "folder"],
      },
    },
  ],
};

export default manifest;
