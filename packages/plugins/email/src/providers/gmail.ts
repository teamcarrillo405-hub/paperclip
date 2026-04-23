import { Buffer } from "node:buffer";
import type {
  DraftParams,
  EmailMessage,
  EmailOAuthTokens,
  EmailSummary,
  EmailThread,
  ListInboxParams,
  SendEmailParams,
} from "../types.js";

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1";
const GMAIL_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_OAUTH_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/userinfo.email",
];

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface GmailOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildGmailAuthUrl(config: GmailOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GMAIL_OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGmailCode(
  config: GmailOAuthConfig,
  code: string,
): Promise<EmailOAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GMAIL_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Gmail token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const expiresAt = Date.now() + json.expires_in * 1000;

  // Get the email address via userinfo
  const profileRes = await fetch(`${GMAIL_API}/users/me/profile`, {
    headers: { Authorization: `Bearer ${json.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error(`Gmail profile fetch failed: ${profileRes.status}`);
  }
  const profile = (await profileRes.json()) as { emailAddress: string };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresAt,
    provider: "gmail",
    emailAddress: profile.emailAddress,
  };
}

export async function refreshGmailToken(
  config: GmailOAuthConfig,
  tokens: EmailOAuthTokens,
): Promise<EmailOAuthTokens> {
  if (!tokens.refreshToken) {
    throw new Error("No refresh token available for Gmail");
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch(GMAIL_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Gmail refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  return {
    ...tokens,
    accessToken: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export async function ensureFreshGmailTokens(
  config: GmailOAuthConfig,
  tokens: EmailOAuthTokens,
): Promise<EmailOAuthTokens> {
  if (tokens.expiresAt - Date.now() > REFRESH_BUFFER_MS) return tokens;
  return refreshGmailToken(config, tokens);
}

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf-8");
}

function encodeBase64Url(data: string): string {
  return Buffer.from(data, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

interface GmailHeader {
  name: string;
  value: string;
}
interface GmailPart {
  mimeType: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: GmailPart[];
}
interface GmailMessageRaw {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailPart & { headers?: GmailHeader[] };
  internalDate?: string;
}

function findHeader(headers: GmailHeader[] | undefined, name: string): string {
  if (!headers) return "";
  const match = headers.find((h) => h.name.toLowerCase() === name.toLowerCase());
  return match?.value ?? "";
}

function extractBody(payload: GmailPart | undefined): { body: string; attachments: GmailPart[] } {
  const attachments: GmailPart[] = [];
  let plainBody = "";
  let htmlBody = "";
  function walk(part: GmailPart | undefined): void {
    if (!part) return;
    if (part.filename && part.filename.length > 0 && part.body?.attachmentId) {
      attachments.push(part);
      return;
    }
    if (part.mimeType === "text/plain" && part.body?.data) {
      plainBody += decodeBase64Url(part.body.data);
    } else if (part.mimeType === "text/html" && part.body?.data) {
      htmlBody += decodeBase64Url(part.body.data);
    }
    if (part.parts) for (const p of part.parts) walk(p);
  }
  walk(payload);
  const body = plainBody || (htmlBody ? stripHtml(htmlBody) : "");
  return { body, attachments };
}

function toSummary(message: GmailMessageRaw): EmailSummary {
  const headers = message.payload?.headers ?? [];
  const unread = message.labelIds?.includes("UNREAD") ?? false;
  const from = findHeader(headers, "From");
  const subject = findHeader(headers, "Subject");
  const date = findHeader(headers, "Date") ||
    (message.internalDate ? new Date(Number(message.internalDate)).toISOString() : "");
  return {
    id: message.id,
    threadId: message.threadId,
    from,
    subject,
    date,
    snippet: message.snippet ?? "",
    unread,
  };
}

function toMessage(message: GmailMessageRaw): EmailMessage {
  const summary = toSummary(message);
  const headers = message.payload?.headers ?? [];
  const { body, attachments } = extractBody(message.payload);
  return {
    ...summary,
    to: findHeader(headers, "To").split(",").map((s) => s.trim()).filter(Boolean),
    cc: findHeader(headers, "Cc").split(",").map((s) => s.trim()).filter(Boolean),
    body,
    attachments: attachments.map((a) => ({
      id: a.body?.attachmentId ?? "",
      filename: a.filename ?? "",
      mimeType: a.mimeType,
      size: a.body?.size ?? 0,
    })),
  };
}

async function gmailFetch<T>(
  tokens: EmailOAuthTokens,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Gmail API ${path} failed: ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as T;
}

export async function listGmailInbox(
  tokens: EmailOAuthTokens,
  params: ListInboxParams,
): Promise<EmailSummary[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
  const qParts: string[] = [];
  if (params.unreadOnly) qParts.push("is:unread");
  const labelIds = params.folder ? [params.folder.toUpperCase()] : ["INBOX"];
  const url = new URLSearchParams({ maxResults: String(limit) });
  for (const id of labelIds) url.append("labelIds", id);
  if (qParts.length > 0) url.set("q", qParts.join(" "));
  const listRes = await gmailFetch<{ messages?: Array<{ id: string }> }>(
    tokens,
    `/users/me/messages?${url.toString()}`,
  );
  const ids = (listRes.messages ?? []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map((id) =>
      gmailFetch<GmailMessageRaw>(tokens, `/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`),
    ),
  );
  return messages.map(toSummary);
}

export async function getGmailMessage(
  tokens: EmailOAuthTokens,
  messageId: string,
): Promise<EmailMessage> {
  const raw = await gmailFetch<GmailMessageRaw>(
    tokens,
    `/users/me/messages/${messageId}?format=full`,
  );
  return toMessage(raw);
}

export async function searchGmail(
  tokens: EmailOAuthTokens,
  query: string,
  limit = 20,
): Promise<EmailSummary[]> {
  const url = new URLSearchParams({ q: query, maxResults: String(Math.max(1, Math.min(limit, 100))) });
  const listRes = await gmailFetch<{ messages?: Array<{ id: string }> }>(
    tokens,
    `/users/me/messages?${url.toString()}`,
  );
  const ids = (listRes.messages ?? []).map((m) => m.id);
  const messages = await Promise.all(
    ids.map((id) => gmailFetch<GmailMessageRaw>(tokens, `/users/me/messages/${id}?format=metadata`)),
  );
  return messages.map(toSummary);
}

export async function getGmailThread(
  tokens: EmailOAuthTokens,
  threadId: string,
): Promise<EmailThread> {
  const raw = await gmailFetch<{ id: string; messages?: GmailMessageRaw[] }>(
    tokens,
    `/users/me/threads/${threadId}?format=full`,
  );
  return {
    id: raw.id,
    messages: (raw.messages ?? []).map(toMessage),
  };
}

function buildMimeMessage(params: {
  from: string;
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  inReplyTo?: string;
  references?: string;
}): string {
  const headers: string[] = [];
  headers.push(`From: ${params.from}`);
  headers.push(`To: ${params.to.join(", ")}`);
  if (params.cc && params.cc.length > 0) headers.push(`Cc: ${params.cc.join(", ")}`);
  headers.push(`Subject: ${params.subject}`);
  if (params.inReplyTo) headers.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) headers.push(`References: ${params.references}`);
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  return `${headers.join("\r\n")}\r\n\r\n${params.body}`;
}

export async function sendGmail(
  tokens: EmailOAuthTokens,
  params: SendEmailParams,
): Promise<{ id: string; threadId: string }> {
  let inReplyTo: string | undefined;
  let references: string | undefined;
  let threadId: string | undefined;
  if (params.replyToMessageId) {
    const original = await gmailFetch<GmailMessageRaw>(
      tokens,
      `/users/me/messages/${params.replyToMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
    );
    const messageIdHeader = findHeader(original.payload?.headers, "Message-ID");
    inReplyTo = messageIdHeader || undefined;
    references = findHeader(original.payload?.headers, "References") || messageIdHeader || undefined;
    threadId = original.threadId;
  }
  const mime = buildMimeMessage({
    from: tokens.emailAddress,
    to: params.to,
    subject: params.subject,
    body: params.body,
    cc: params.cc,
    inReplyTo,
    references,
  });
  const raw = encodeBase64Url(mime);
  const payload: Record<string, unknown> = { raw };
  if (threadId) payload.threadId = threadId;
  const res = await gmailFetch<{ id: string; threadId: string }>(tokens, `/users/me/messages/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res;
}

export async function createGmailDraft(
  tokens: EmailOAuthTokens,
  params: DraftParams,
): Promise<{ id: string }> {
  let inReplyTo: string | undefined;
  let references: string | undefined;
  let threadId: string | undefined;
  if (params.replyToMessageId) {
    const original = await gmailFetch<GmailMessageRaw>(
      tokens,
      `/users/me/messages/${params.replyToMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
    );
    const messageIdHeader = findHeader(original.payload?.headers, "Message-ID");
    inReplyTo = messageIdHeader || undefined;
    references = findHeader(original.payload?.headers, "References") || messageIdHeader || undefined;
    threadId = original.threadId;
  }
  const mime = buildMimeMessage({
    from: tokens.emailAddress,
    to: params.to,
    subject: params.subject,
    body: params.body,
    cc: params.cc,
    inReplyTo,
    references,
  });
  const messagePayload: Record<string, unknown> = { raw: encodeBase64Url(mime) };
  if (threadId) messagePayload.threadId = threadId;
  const res = await gmailFetch<{ id: string }>(tokens, `/users/me/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: messagePayload }),
  });
  return { id: res.id };
}

export async function markGmailRead(
  tokens: EmailOAuthTokens,
  messageId: string,
): Promise<void> {
  await gmailFetch(tokens, `/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removeLabelIds: ["UNREAD"] }),
  });
}

export async function moveGmailToFolder(
  tokens: EmailOAuthTokens,
  messageId: string,
  folder: string,
): Promise<void> {
  const labelId = folder.toUpperCase();
  await gmailFetch(tokens, `/users/me/messages/${messageId}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      addLabelIds: [labelId],
      removeLabelIds: ["INBOX"],
    }),
  });
}
