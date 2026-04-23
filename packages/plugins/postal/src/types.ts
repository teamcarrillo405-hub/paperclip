export interface PostalConfig {
  internalUrl: string;
  apiKey: string;
  fromAddress: string;
  fromName: string;
}

export interface RenderedTemplate {
  subject: string;
  html: string;
  text: string;
}

export type TemplateName =
  | "welcome"
  | "invoice-reminder"
  | "weekly-report"
  | "review-request"
  | "appointment";

export interface SendEmailParams {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  tag?: string;
}

export interface PostalSendResponse {
  messageId: string;
  queuedAt: number;
  recipients: string[];
}

export interface BulkRecipient {
  email: string;
  variables?: Record<string, unknown>;
}

export interface BulkSendOptions {
  ratePerSecond?: number;
  tag?: string;
}

export interface BulkSendResult {
  sent: number;
  failed: number;
  messageIds: string[];
  errors: Array<{ email: string; error: string }>;
}

export interface EmailStats {
  sent: number;
  delivered: number;
  bounced: number;
  opened: number;
  clicked: number;
  queued: number;
  failed: number;
  windowDays: number;
}

export interface WelcomeVars {
  userName?: string;
  companyName?: string;
  dashboardUrl?: string;
}

export interface InvoiceReminderVars {
  customerName: string;
  invoiceNumber: string;
  amount: string | number;
  daysOverdue: number;
  dueDate?: string;
  payUrl?: string;
  businessName?: string;
}

export interface WeeklyReportVars {
  companyName: string;
  periodLabel?: string;
  agentsCount?: number;
  accomplishments?: string[];
  metricsUrl?: string;
}

export interface ReviewRequestVars {
  customerName: string;
  businessName: string;
  reviewUrl?: string;
  jobDescription?: string;
}

export interface AppointmentVars {
  customerName: string;
  businessName: string;
  date: string;
  time: string;
  address?: string;
  notes?: string;
}

// ---------------------------------------------------------------------------
// Avero AI bonus #17 — high-level Postal API with SMTP/console fallback
// ---------------------------------------------------------------------------

export interface EmailMessage {
  to: string;
  from?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface AveroPostalConfig {
  host?: string;
  port?: number;
  apiKey?: string;
  fromDomain?: string;
  fromAddress?: string;
}

export type EmailTemplate =
  | "welcome"
  | "invoice"
  | "alert"
  | "report"
  | "followup";

export type EmailProvider = "postal" | "smtp" | "console";

export interface SendResult {
  messageId: string;
  status: "sent" | "queued" | "failed";
  timestamp: string;
  provider: EmailProvider;
  error?: string;
}

export interface EmailHistoryRow {
  id: string;
  companyId: string;
  to: string;
  from: string;
  subject: string;
  templateName: string | null;
  status: string;
  messageId: string | null;
  provider: string;
  error: string | null;
  createdAt: string;
}

export interface InvoiceLineItem {
  description: string;
  amount: string | number;
  quantity?: number;
}

export interface InvoiceEmailVars {
  customerName: string;
  invoiceNumber: string;
  lineItems: InvoiceLineItem[];
  total: string | number;
  dueDate?: string;
  payUrl?: string;
  businessName?: string;
}

export interface AlertEmailVars {
  title: string;
  message: string;
  severity?: "info" | "warning" | "critical";
  detailsUrl?: string;
  companyName?: string;
}

export interface ReportEmailVars {
  companyName: string;
  periodLabel: string;
  metrics: Array<{ label: string; value: string | number; trend?: string }>;
  highlights?: string[];
  dashboardUrl?: string;
}

export interface FollowupEmailVars {
  customerName: string;
  businessName: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export type TemplateVarsMap = {
  welcome: WelcomeVars;
  invoice: InvoiceEmailVars;
  alert: AlertEmailVars;
  report: ReportEmailVars;
  followup: FollowupEmailVars;
};
