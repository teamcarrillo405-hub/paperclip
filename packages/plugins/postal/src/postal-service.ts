import type {
  EmailStats,
  PostalConfig,
  PostalSendResponse,
  SendEmailParams,
} from "./types.js";

export class PostalServiceError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "PostalServiceError";
  }
}

export class PostalService {
  constructor(private readonly config: PostalConfig) {
    if (!config.apiKey) {
      throw new PostalServiceError("POSTAL_API_KEY is required");
    }
  }

  async send(params: SendEmailParams): Promise<PostalSendResponse> {
    const recipients = Array.isArray(params.to) ? params.to : [params.to];
    const body = {
      to: recipients,
      from: `${this.config.fromName} <${this.config.fromAddress}>`,
      sender: this.config.fromAddress,
      subject: params.subject,
      html_body: params.html,
      plain_body: params.text,
      reply_to: params.replyTo,
      tag: params.tag,
    };
    const url = `${trimSlash(this.config.internalUrl)}/api/v1/send/message`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Server-API-Key": this.config.apiKey,
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await safeText(response);
      throw new PostalServiceError(
        `Postal send failed (${response.status}): ${text}`,
        response.status,
      );
    }
    const data = (await response.json()) as {
      status?: string;
      data?: { message_id?: string; messages?: Record<string, { id?: string | number }> };
    };
    const messageId =
      (data.data?.message_id ??
        Object.values(data.data?.messages ?? {})
          .map((m) => (m?.id != null ? String(m.id) : ""))
          .filter(Boolean)
          .join(",")) ||
      `postal-${Date.now()}`;
    return {
      messageId,
      queuedAt: Date.now(),
      recipients,
    };
  }

  async getStats(windowDays = 7): Promise<EmailStats> {
    const url = `${trimSlash(this.config.internalUrl)}/api/v1/stats/summary`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Server-API-Key": this.config.apiKey,
        },
        body: JSON.stringify({ window_days: windowDays }),
      });
      if (!response.ok) {
        return emptyStats(windowDays);
      }
      const data = (await response.json()) as {
        data?: Partial<EmailStats>;
      };
      const d = data.data ?? {};
      return {
        sent: numberOr(d.sent, 0),
        delivered: numberOr(d.delivered, 0),
        bounced: numberOr(d.bounced, 0),
        opened: numberOr(d.opened, 0),
        clicked: numberOr(d.clicked, 0),
        queued: numberOr(d.queued, 0),
        failed: numberOr(d.failed, 0),
        windowDays,
      };
    } catch {
      return emptyStats(windowDays);
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${trimSlash(this.config.internalUrl)}/api/v1/ping`, {
        method: "GET",
        headers: { "X-Server-API-Key": this.config.apiKey },
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

function trimSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "<no body>";
  }
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function emptyStats(windowDays: number): EmailStats {
  return {
    sent: 0,
    delivered: 0,
    bounced: 0,
    opened: 0,
    clicked: 0,
    queued: 0,
    failed: 0,
    windowDays,
  };
}
