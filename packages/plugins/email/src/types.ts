export type EmailProvider = "gmail" | "outlook";

export interface EmailOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: EmailProvider;
  emailAddress: string;
}

export interface EmailSummary {
  id: string;
  threadId?: string;
  from: string;
  to?: string[];
  subject: string;
  date: string;
  snippet: string;
  unread: boolean;
}

export interface EmailAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface EmailMessage extends EmailSummary {
  body: string;
  attachments: EmailAttachment[];
  cc?: string[];
  bcc?: string[];
}

export interface EmailThread {
  id: string;
  messages: EmailMessage[];
}

export interface SendEmailParams {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  bcc?: string[];
  replyToMessageId?: string;
}

export interface DraftParams {
  to: string[];
  subject: string;
  body: string;
  cc?: string[];
  replyToMessageId?: string;
}

export interface ListInboxParams {
  limit?: number;
  unreadOnly?: boolean;
  folder?: string;
}
