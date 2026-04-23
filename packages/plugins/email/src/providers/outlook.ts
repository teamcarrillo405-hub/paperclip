import type {
  DraftParams,
  EmailMessage,
  EmailOAuthTokens,
  EmailSummary,
  EmailThread,
  ListInboxParams,
  SendEmailParams,
} from "../types.js";

const GRAPH_API = "https://graph.microsoft.com/v1.0";
const OUTLOOK_OAUTH_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize";
const OUTLOOK_OAUTH_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token";
const OUTLOOK_SCOPES = [
  "offline_access",
  "Mail.Read",
  "Mail.Send",
  "Mail.ReadWrite",
  "User.Read",
];

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

export interface OutlookOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function buildOutlookAuthUrl(config: OutlookOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    response_mode: "query",
    scope: OUTLOOK_SCOPES.join(" "),
    state,
  });
  return `${OUTLOOK_OAUTH_AUTH_URL}?${params.toString()}`;
}

export async function exchangeOutlookCode(
  config: OutlookOAuthConfig,
  code: string,
): Promise<EmailOAuthTokens> {
  const body = new URLSearchParams({
    code,
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUri,
    grant_type: "authorization_code",
    scope: OUTLOOK_SCOPES.join(" "),
  });
  const res = await fetch(OUTLOOK_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Outlook token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  const expiresAt = Date.now() + json.expires_in * 1000;

  const profileRes = await fetch(`${GRAPH_API}/me`, {
    headers: { Authorization: `Bearer ${json.access_token}` },
  });
  if (!profileRes.ok) {
    throw new Error(`Outlook profile fetch failed: ${profileRes.status}`);
  }
  const profile = (await profileRes.json()) as {
    mail?: string;
    userPrincipalName?: string;
  };

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? "",
    expiresAt,
    provider: "outlook",
    emailAddress: profile.mail ?? profile.userPrincipalName ?? "",
  };
}

export async function refreshOutlookToken(
  config: OutlookOAuthConfig,
  tokens: EmailOAuthTokens,
): Promise<EmailOAuthTokens> {
  if (!tokens.refreshToken) {
    throw new Error("No refresh token available for Outlook");
  }
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    refresh_token: tokens.refreshToken,
    grant_type: "refresh_token",
    scope: OUTLOOK_SCOPES.join(" "),
  });
  const res = await fetch(OUTLOOK_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Outlook refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
  return {
    ...tokens,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? tokens.refreshToken,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
}

export async function ensureFreshOutlookTokens(
  config: OutlookOAuthConfig,
  tokens: EmailOAuthTokens,
): Promise<EmailOAuthTokens> {
  if (tokens.expiresAt - Date.now() > REFRESH_BUFFER_MS) return tokens;
  return refreshOutlookToken(config, tokens);
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

interface OutlookMessageRaw {
  id: string;
  conversationId?: string;
  subject?: string;
  bodyPreview?: string;
  body?: { contentType: "html" | "text"; content: string };
  from?: { emailAddress?: { address?: string; name?: string } };
  toRecipients?: Array<{ emailAddress?: { address?: string } }>;
  ccRecipients?: Array<{ emailAddress?: { address?: string } }>;
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  hasAttachments?: boolean;
}

function addressOf(entry?: { emailAddress?: { address?: string; name?: string } }): string {
  if (!entry?.emailAddress) return "";
  const { address, name } = entry.emailAddress;
  if (name && address) return `${name} <${address}>`;
  return address ?? "";
}

function toSummary(raw: OutlookMessageRaw): EmailSummary {
  return {
    id: raw.id,
    threadId: raw.conversationId,
    from: addressOf(raw.from),
    subject: raw.subject ?? "",
    date: raw.receivedDateTime ?? raw.sentDateTime ?? "",
    snippet: raw.bodyPreview ?? "",
    unread: raw.isRead === false,
  };
}

async function graphFetch<T>(
  tokens: EmailOAuthTokens,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${GRAPH_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${tokens.accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    throw new Error(`Graph API ${path} failed: ${res.status} ${await res.text()}`);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function listOutlookInbox(
  tokens: EmailOAuthTokens,
  params: ListInboxParams,
): Promise<EmailSummary[]> {
  const limit = Math.max(1, Math.min(params.limit ?? 20, 100));
  const folder = params.folder ?? "Inbox";
  const qs = new URLSearchParams({
    $top: String(limit),
    $orderby: "receivedDateTime desc",
    $select: "id,conversationId,subject,bodyPreview,from,receivedDateTime,isRead",
  });
  if (params.unreadOnly) qs.set("$filter", "isRead eq false");
  const res = await graphFetch<{ value: OutlookMessageRaw[] }>(
    tokens,
    `/me/mailFolders/${encodeURIComponent(folder)}/messages?${qs.toString()}`,
  );
  return res.value.map(toSummary);
}

export async function getOutlookMessage(
  tokens: EmailOAuthTokens,
  messageId: string,
): Promise<EmailMessage> {
  const raw = await graphFetch<OutlookMessageRaw>(
    tokens,
    `/me/messages/${messageId}?$select=id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments`,
  );
  const summary = toSummary(raw);
  const attachments = raw.hasAttachments
    ? await graphFetch<{
        value: Array<{ id: string; name: string; contentType: string; size: number }>;
      }>(tokens, `/me/messages/${messageId}/attachments?$select=id,name,contentType,size`)
    : { value: [] };
  const bodyContent = raw.body?.content ?? "";
  const body =
    raw.body?.contentType === "html" ? stripHtml(bodyContent) : bodyContent;
  return {
    ...summary,
    to: (raw.toRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean),
    cc: (raw.ccRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean),
    body,
    attachments: attachments.value.map((a) => ({
      id: a.id,
      filename: a.name,
      mimeType: a.contentType,
      size: a.size,
    })),
  };
}

export async function searchOutlook(
  tokens: EmailOAuthTokens,
  query: string,
  limit = 20,
): Promise<EmailSummary[]> {
  const qs = new URLSearchParams({
    $top: String(Math.max(1, Math.min(limit, 100))),
    $search: `"${query}"`,
    $select: "id,conversationId,subject,bodyPreview,from,receivedDateTime,isRead",
  });
  const res = await graphFetch<{ value: OutlookMessageRaw[] }>(
    tokens,
    `/me/messages?${qs.toString()}`,
  );
  return res.value.map(toSummary);
}

export async function getOutlookThread(
  tokens: EmailOAuthTokens,
  threadId: string,
): Promise<EmailThread> {
  const qs = new URLSearchParams({
    $filter: `conversationId eq '${threadId}'`,
    $orderby: "receivedDateTime asc",
    $select: "id,conversationId,subject,bodyPreview,body,from,toRecipients,ccRecipients,receivedDateTime,isRead,hasAttachments",
    $top: "50",
  });
  const res = await graphFetch<{ value: OutlookMessageRaw[] }>(
    tokens,
    `/me/messages?${qs.toString()}`,
  );
  const messages: EmailMessage[] = res.value.map((raw) => {
    const summary = toSummary(raw);
    const bodyContent = raw.body?.content ?? "";
    const body =
      raw.body?.contentType === "html" ? stripHtml(bodyContent) : bodyContent;
    return {
      ...summary,
      to: (raw.toRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean),
      cc: (raw.ccRecipients ?? []).map((r) => r.emailAddress?.address ?? "").filter(Boolean),
      body,
      attachments: [],
    };
  });
  return { id: threadId, messages };
}

function toRecipients(addresses: string[] | undefined) {
  return (addresses ?? []).map((address) => ({ emailAddress: { address } }));
}

export async function sendOutlook(
  tokens: EmailOAuthTokens,
  params: SendEmailParams,
): Promise<{ id?: string }> {
  if (params.replyToMessageId) {
    await graphFetch(tokens, `/me/messages/${params.replyToMessageId}/reply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        comment: params.body,
        message: {
          toRecipients: toRecipients(params.to),
          ccRecipients: toRecipients(params.cc),
        },
      }),
    });
    return {};
  }
  await graphFetch(tokens, `/me/sendMail`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: params.subject,
        body: { contentType: "Text", content: params.body },
        toRecipients: toRecipients(params.to),
        ccRecipients: toRecipients(params.cc),
        bccRecipients: toRecipients(params.bcc),
      },
      saveToSentItems: true,
    }),
  });
  return {};
}

export async function createOutlookDraft(
  tokens: EmailOAuthTokens,
  params: DraftParams,
): Promise<{ id: string }> {
  if (params.replyToMessageId) {
    const draft = await graphFetch<{ id: string }>(
      tokens,
      `/me/messages/${params.replyToMessageId}/createReply`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment: params.body }),
      },
    );
    return { id: draft.id };
  }
  const draft = await graphFetch<{ id: string }>(tokens, `/me/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subject: params.subject,
      body: { contentType: "Text", content: params.body },
      toRecipients: toRecipients(params.to),
      ccRecipients: toRecipients(params.cc),
    }),
  });
  return { id: draft.id };
}

export async function markOutlookRead(
  tokens: EmailOAuthTokens,
  messageId: string,
): Promise<void> {
  await graphFetch(tokens, `/me/messages/${messageId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isRead: true }),
  });
}

export async function moveOutlookToFolder(
  tokens: EmailOAuthTokens,
  messageId: string,
  folder: string,
): Promise<void> {
  await graphFetch(tokens, `/me/messages/${messageId}/move`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ destinationId: folder }),
  });
}
