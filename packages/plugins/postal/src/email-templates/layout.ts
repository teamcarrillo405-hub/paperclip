export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface LayoutOptions {
  title: string;
  body: string;
  preheader?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  footerNote?: string;
}

export function renderLayout(opts: LayoutOptions): string {
  const { title, body, preheader, ctaLabel, ctaUrl, footerNote } = opts;
  const cta =
    ctaLabel && ctaUrl
      ? `<table role="presentation" style="margin:24px 0;border-collapse:collapse;">
           <tr><td style="border-radius:6px;background:#2563eb;">
             <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:600;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;">${escapeHtml(ctaLabel)}</a>
           </td></tr>
         </table>`
      : "";
  const footer = footerNote
    ? `<p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:1.5;">${escapeHtml(footerNote)}</p>`
    : "";
  const hiddenPreheader = preheader
    ? `<span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;">${escapeHtml(preheader)}</span>`
    : "";
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#111827;">
    ${hiddenPreheader}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:10px;padding:28px;">
          <tr><td>
            <div style="font-weight:700;font-size:16px;color:#111827;margin-bottom:16px;">Avero AI</div>
            <h1 style="margin:0 0 16px;font-size:20px;line-height:1.3;color:#111827;">${escapeHtml(title)}</h1>
            <div style="font-size:15px;line-height:1.6;color:#374151;">${body}</div>
            ${cta}
            ${footer}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}
