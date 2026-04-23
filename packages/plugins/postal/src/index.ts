export * from "./types.js";
export * from "./email-templates.js";
export { PostalService as AveroPostalService, getDefaultPostalService, resetDefaultPostalService } from "./avero-postal-service.js";
export type { EmailSendsDb, NodemailerLike, PostalServiceOptions } from "./avero-postal-service.js";
export { PostalService as PostalTransportClient, PostalServiceError } from "./postal-service.js";

import type { PostalService } from "./avero-postal-service.js";
import type {
  AlertEmailVars,
  EmailHistoryRow,
  EmailMessage,
  FollowupEmailVars,
  InvoiceEmailVars,
  ReportEmailVars,
  SendResult,
  WelcomeVars,
} from "./types.js";

export interface AgentToolContext {
  companyId: string;
  service: PostalService;
}

export interface AgentTool<Input, Output> {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run: (input: Input, ctx: AgentToolContext) => Promise<Output>;
}

export const sendEmailTool: AgentTool<EmailMessage, SendResult> = {
  name: "send_email",
  description: "Send a plain transactional email via Postal (with SMTP/console fallback).",
  inputSchema: {
    type: "object",
    required: ["to", "subject", "html"],
    properties: {
      to: { type: "string", description: "Recipient email address" },
      from: { type: "string", description: "Optional sender override" },
      subject: { type: "string" },
      html: { type: "string" },
      text: { type: "string" },
      replyTo: { type: "string" },
    },
  },
  run: async (input, ctx) => ctx.service.sendEmail(input, { companyId: ctx.companyId }),
};

export const sendWelcomeEmailTool: AgentTool<{ to: string } & WelcomeVars, SendResult> = {
  name: "send_welcome_email",
  description: "Send a welcome email to a new customer.",
  inputSchema: {
    type: "object",
    required: ["to"],
    properties: {
      to: { type: "string" },
      userName: { type: "string" },
      companyName: { type: "string" },
      dashboardUrl: { type: "string" },
    },
  },
  run: async ({ to, ...vars }, ctx) =>
    ctx.service.sendTemplate("welcome", to, vars, ctx.companyId),
};

export const sendInvoiceEmailTool: AgentTool<{ to: string } & InvoiceEmailVars, SendResult> = {
  name: "send_invoice_email",
  description: "Send an invoice / payment receipt email with line items.",
  inputSchema: {
    type: "object",
    required: ["to", "customerName", "invoiceNumber", "lineItems", "total"],
    properties: {
      to: { type: "string" },
      customerName: { type: "string" },
      invoiceNumber: { type: "string" },
      lineItems: {
        type: "array",
        items: {
          type: "object",
          required: ["description", "amount"],
          properties: {
            description: { type: "string" },
            amount: { type: ["string", "number"] },
            quantity: { type: "number" },
          },
        },
      },
      total: { type: ["string", "number"] },
      dueDate: { type: "string" },
      payUrl: { type: "string" },
      businessName: { type: "string" },
    },
  },
  run: async ({ to, ...vars }, ctx) =>
    ctx.service.sendTemplate("invoice", to, vars, ctx.companyId),
};

export const sendAlertEmailTool: AgentTool<{ to: string } & AlertEmailVars, SendResult> = {
  name: "send_alert_email",
  description: "Send a Guardian / monitoring alert email.",
  inputSchema: {
    type: "object",
    required: ["to", "title", "message"],
    properties: {
      to: { type: "string" },
      title: { type: "string" },
      message: { type: "string" },
      severity: { type: "string", enum: ["info", "warning", "critical"] },
      detailsUrl: { type: "string" },
      companyName: { type: "string" },
    },
  },
  run: async ({ to, ...vars }, ctx) =>
    ctx.service.sendTemplate("alert", to, vars, ctx.companyId),
};

export const sendReportEmailTool: AgentTool<{ to: string } & ReportEmailVars, SendResult> = {
  name: "send_report_email",
  description: "Send a weekly business report email with metrics.",
  inputSchema: {
    type: "object",
    required: ["to", "companyName", "periodLabel", "metrics"],
    properties: {
      to: { type: "string" },
      companyName: { type: "string" },
      periodLabel: { type: "string" },
      metrics: {
        type: "array",
        items: {
          type: "object",
          required: ["label", "value"],
          properties: {
            label: { type: "string" },
            value: { type: ["string", "number"] },
            trend: { type: "string" },
          },
        },
      },
      highlights: { type: "array", items: { type: "string" } },
      dashboardUrl: { type: "string" },
    },
  },
  run: async ({ to, ...vars }, ctx) =>
    ctx.service.sendTemplate("report", to, vars, ctx.companyId),
};

export const sendFollowupEmailTool: AgentTool<{ to: string } & FollowupEmailVars, SendResult> = {
  name: "send_followup_email",
  description: "Send a follow-up email to a customer with an optional CTA.",
  inputSchema: {
    type: "object",
    required: ["to", "customerName", "businessName", "message"],
    properties: {
      to: { type: "string" },
      customerName: { type: "string" },
      businessName: { type: "string" },
      message: { type: "string" },
      ctaLabel: { type: "string" },
      ctaUrl: { type: "string" },
    },
  },
  run: async ({ to, ...vars }, ctx) =>
    ctx.service.sendTemplate("followup", to, vars, ctx.companyId),
};

export const getEmailHistoryTool: AgentTool<{ limit?: number }, EmailHistoryRow[]> = {
  name: "get_email_history",
  description: "List recent emails sent for the current company.",
  inputSchema: {
    type: "object",
    properties: {
      limit: { type: "number", description: "Max number of rows to return (1-500, default 50)" },
    },
  },
  run: async (input, ctx) => ctx.service.getEmailHistory(ctx.companyId, input?.limit ?? 50),
};

export const POSTAL_AGENT_TOOLS = [
  sendEmailTool,
  sendWelcomeEmailTool,
  sendInvoiceEmailTool,
  sendAlertEmailTool,
  sendReportEmailTool,
  sendFollowupEmailTool,
  getEmailHistoryTool,
] as const;
