import type {
  AlertEmailVars,
  FollowupEmailVars,
  InvoiceEmailVars,
  ReportEmailVars,
  WelcomeVars,
  EmailTemplate,
} from "./types.js";

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function money(value: string | number): string {
  if (typeof value === "number") {
    return `$${value.toFixed(2)}`;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return "$0.00";
  if (/^[-$]/.test(trimmed)) return trimmed;
  const num = Number(trimmed);
  if (Number.isFinite(num)) return `$${num.toFixed(2)}`;
  return trimmed;
}

const BRAND_PRIMARY = "#2563eb";
const BRAND_ACCENT = "#16a34a";
const BRAND_ALERT = "#f97316";

interface ShellOpts {
  title: string;
  headerColor: string;
  body: string;
  preheader?: string;
}

function shell({ title, headerColor, body, preheader }: ShellOpts): string {
  const pre = preheader
    ? `<span style="display:none;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>`
    : "";
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">
  ${pre}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;">
        <tr><td style="background:${headerColor};padding:20px 28px;color:#ffffff;">
          <div style="font-weight:700;font-size:18px;">Avero AI</div>
        </td></tr>
        <tr><td style="padding:28px;font-size:15px;line-height:1.6;color:#1f2937;">
          ${body}
        </td></tr>
        <tr><td style="padding:16px 28px;background:#f9fafb;color:#6b7280;font-size:12px;border-top:1px solid #e5e7eb;">
          Sent by Avero AI · <a href="#" style="color:${BRAND_PRIMARY};text-decoration:none;">Manage preferences</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export function renderWelcomeEmail(vars: WelcomeVars): { subject: string; html: string; text: string } {
  const name = vars.userName ?? "there";
  const company = vars.companyName ?? "your business";
  const dash = vars.dashboardUrl ?? "#";
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">Welcome to Avero AI, ${escapeHtml(name)}!</h1>
    <p>We're thrilled to have ${escapeHtml(company)} on board. Your AI agents are ready to help you automate work, delight customers, and grow faster.</p>
    <p>Here's what to do next:</p>
    <ul>
      <li>Finish your setup guide to configure your first agent.</li>
      <li>Connect your business tools (QuickBooks, email, voice).</li>
      <li>Launch your first automation or AI crew.</li>
    </ul>
    <table role="presentation" style="margin:24px 0;">
      <tr><td style="border-radius:6px;background:${BRAND_PRIMARY};">
        <a href="${escapeHtml(dash)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">Open your dashboard</a>
      </td></tr>
    </table>
    <p style="color:#6b7280;font-size:13px;">Need help? Reply to this email and our team will get back to you.</p>`;
  return {
    subject: `Welcome to Avero AI, ${name}`,
    html: shell({ title: "Welcome to Avero AI", headerColor: BRAND_PRIMARY, body, preheader: "Your AI workforce is ready." }),
    text: `Welcome to Avero AI, ${name}! We're thrilled to have ${company} on board. Open your dashboard: ${dash}`,
  };
}

export function renderInvoiceEmail(vars: InvoiceEmailVars): { subject: string; html: string; text: string } {
  const rows = vars.lineItems
    .map(
      (item) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;">${escapeHtml(item.description)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:center;">${escapeHtml(item.quantity ?? 1)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;">${escapeHtml(money(item.amount))}</td>
      </tr>`,
    )
    .join("");
  const business = vars.businessName ?? "Avero AI";
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">Invoice ${escapeHtml(vars.invoiceNumber)}</h1>
    <p>Hi ${escapeHtml(vars.customerName)}, thanks for your business! Here are the details of your invoice from ${escapeHtml(business)}.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;margin:16px 0;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Description</th>
          <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;color:#6b7280;">Qty</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <td colspan="2" style="padding:12px;text-align:right;font-weight:700;">Total</td>
          <td style="padding:12px;text-align:right;font-weight:700;color:${BRAND_PRIMARY};">${escapeHtml(money(vars.total))}</td>
        </tr>
      </tfoot>
    </table>
    ${vars.dueDate ? `<p><strong>Due:</strong> ${escapeHtml(vars.dueDate)}</p>` : ""}
    ${
      vars.payUrl
        ? `<table role="presentation" style="margin:24px 0;"><tr><td style="border-radius:6px;background:${BRAND_ACCENT};">
           <a href="${escapeHtml(vars.payUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">Pay invoice</a>
         </td></tr></table>`
        : ""
    }
    <p style="color:#6b7280;font-size:13px;">Questions? Reply to this email and we'll help.</p>`;
  return {
    subject: `Invoice ${vars.invoiceNumber} from ${business}`,
    html: shell({ title: `Invoice ${vars.invoiceNumber}`, headerColor: BRAND_PRIMARY, body }),
    text: `Invoice ${vars.invoiceNumber} from ${business} — Total: ${money(vars.total)}${vars.payUrl ? ` — Pay: ${vars.payUrl}` : ""}`,
  };
}

export function renderAlertEmail(vars: AlertEmailVars): { subject: string; html: string; text: string } {
  const sev = vars.severity ?? "warning";
  const sevColor = sev === "critical" ? "#dc2626" : sev === "info" ? BRAND_PRIMARY : BRAND_ALERT;
  const sevLabel = sev.toUpperCase();
  const body = `
    <div style="display:inline-block;padding:4px 10px;border-radius:999px;background:${sevColor};color:#ffffff;font-size:11px;font-weight:700;letter-spacing:0.5px;margin-bottom:12px;">${sevLabel}</div>
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">${escapeHtml(vars.title)}</h1>
    <p>${escapeHtml(vars.message)}</p>
    ${vars.companyName ? `<p style="color:#6b7280;font-size:13px;">Company: ${escapeHtml(vars.companyName)}</p>` : ""}
    ${
      vars.detailsUrl
        ? `<table role="presentation" style="margin:24px 0;"><tr><td style="border-radius:6px;background:${sevColor};">
           <a href="${escapeHtml(vars.detailsUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">View details</a>
         </td></tr></table>`
        : ""
    }
    <p style="color:#6b7280;font-size:13px;">This alert was triggered by your Guardian monitoring rules.</p>`;
  return {
    subject: `[${sevLabel}] ${vars.title}`,
    html: shell({ title: vars.title, headerColor: BRAND_ALERT, body, preheader: vars.message.slice(0, 90) }),
    text: `[${sevLabel}] ${vars.title} — ${vars.message}${vars.detailsUrl ? ` — ${vars.detailsUrl}` : ""}`,
  };
}

export function renderReportEmail(vars: ReportEmailVars): { subject: string; html: string; text: string } {
  const metricRows = vars.metrics
    .map(
      (m) => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;color:#6b7280;font-size:13px;">${escapeHtml(m.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;">${escapeHtml(m.value)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e5e7eb;text-align:right;color:${BRAND_ACCENT};font-size:13px;">${escapeHtml(m.trend ?? "")}</td>
      </tr>`,
    )
    .join("");
  const highlights = (vars.highlights ?? [])
    .map((h) => `<li>${escapeHtml(h)}</li>`)
    .join("");
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">Weekly Business Report</h1>
    <p>${escapeHtml(vars.companyName)} — ${escapeHtml(vars.periodLabel)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;border-collapse:separate;border-spacing:0;margin:16px 0;">
      <thead>
        <tr style="background:#f3f4f6;">
          <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;color:#6b7280;">Metric</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Value</th>
          <th style="padding:10px 12px;text-align:right;font-size:12px;text-transform:uppercase;color:#6b7280;">Trend</th>
        </tr>
      </thead>
      <tbody>${metricRows}</tbody>
    </table>
    ${highlights ? `<h2 style="font-size:16px;margin:24px 0 8px;">Highlights</h2><ul style="padding-left:20px;">${highlights}</ul>` : ""}
    ${
      vars.dashboardUrl
        ? `<table role="presentation" style="margin:24px 0;"><tr><td style="border-radius:6px;background:${BRAND_PRIMARY};">
           <a href="${escapeHtml(vars.dashboardUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">View full dashboard</a>
         </td></tr></table>`
        : ""
    }`;
  return {
    subject: `${vars.companyName} — Weekly Report (${vars.periodLabel})`,
    html: shell({ title: "Weekly Business Report", headerColor: BRAND_PRIMARY, body }),
    text: `Weekly Report for ${vars.companyName} — ${vars.periodLabel}. ${vars.metrics.map((m) => `${m.label}: ${m.value}`).join("; ")}`,
  };
}

export function renderFollowupEmail(vars: FollowupEmailVars): { subject: string; html: string; text: string } {
  const ctaLabel = vars.ctaLabel ?? "Learn more";
  const body = `
    <h1 style="margin:0 0 12px;font-size:22px;color:#111827;">A quick check-in</h1>
    <p>Hi ${escapeHtml(vars.customerName)},</p>
    <p>${escapeHtml(vars.message)}</p>
    <p>We'd love to hear your thoughts and help with anything you need.</p>
    ${
      vars.ctaUrl
        ? `<table role="presentation" style="margin:24px 0;"><tr><td style="border-radius:6px;background:${BRAND_PRIMARY};">
           <a href="${escapeHtml(vars.ctaUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;">${escapeHtml(ctaLabel)}</a>
         </td></tr></table>`
        : ""
    }
    <p style="color:#374151;">Best,<br/>The ${escapeHtml(vars.businessName)} team</p>`;
  return {
    subject: `Following up with you, ${vars.customerName}`,
    html: shell({ title: "Following up", headerColor: BRAND_PRIMARY, body }),
    text: `Hi ${vars.customerName}, ${vars.message}${vars.ctaUrl ? ` — ${ctaLabel}: ${vars.ctaUrl}` : ""} — ${vars.businessName}`,
  };
}

export type TemplateRenderer<V> = (vars: V) => { subject: string; html: string; text: string };

export const TEMPLATE_RENDERERS = {
  welcome: renderWelcomeEmail,
  invoice: renderInvoiceEmail,
  alert: renderAlertEmail,
  report: renderReportEmail,
  followup: renderFollowupEmail,
} as const;

export function renderTemplate(
  name: EmailTemplate,
  vars: Record<string, unknown>,
): { subject: string; html: string; text: string } {
  const renderer = TEMPLATE_RENDERERS[name];
  if (!renderer) throw new Error(`Unknown email template: ${name}`);
  return (renderer as TemplateRenderer<Record<string, unknown>>)(vars);
}
