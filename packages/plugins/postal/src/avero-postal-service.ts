import type {
  AveroPostalConfig,
  EmailHistoryRow,
  EmailMessage,
  EmailProvider,
  EmailTemplate,
  SendResult,
  TemplateVarsMap,
} from "./types.js";
import { renderTemplate } from "./email-templates.js";

export interface EmailSendsDb {
  insert: (row: {
    companyId: string;
    to: string;
    from: string;
    subject: string;
    templateName: string | null;
    status: string;
    messageId: string | null;
    provider: string;
    error: string | null;
  }) => Promise<void>;
  listByCompany: (companyId: string, limit: number) => Promise<EmailHistoryRow[]>;
}

export interface NodemailerLike {
  createTransport: (options: Record<string, unknown>) => {
    sendMail: (message: {
      from: string;
      to: string;
      subject: string;
      html: string;
      text?: string;
      replyTo?: string;
    }) => Promise<{ messageId?: string }>;
  };
}

export interface PostalServiceOptions {
  env?: NodeJS.ProcessEnv;
  db?: EmailSendsDb;
  nodemailer?: NodemailerLike;
  logger?: Pick<Console, "info" | "warn" | "error">;
}

function readEnvConfig(env: NodeJS.ProcessEnv): AveroPostalConfig & {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  smtpFrom?: string;
} {
  const port = env.POSTAL_PORT ? Number(env.POSTAL_PORT) : undefined;
  const smtpPort = env.SMTP_PORT ? Number(env.SMTP_PORT) : undefined;
  return {
    host: env.POSTAL_HOST,
    port: Number.isFinite(port) ? port : undefined,
    apiKey: env.POSTAL_API_KEY,
    fromDomain: env.POSTAL_FROM_DOMAIN,
    fromAddress: env.SMTP_FROM,
    smtpHost: env.SMTP_HOST,
    smtpPort: Number.isFinite(smtpPort) ? smtpPort : undefined,
    smtpUser: env.SMTP_USER,
    smtpPass: env.SMTP_PASS,
    smtpFrom: env.SMTP_FROM,
  };
}

function buildFrom(
  envFrom: string | undefined,
  domain: string | undefined,
  override?: string,
): string {
  if (override) return override;
  if (envFrom) return envFrom;
  if (domain) return `noreply@${domain}`;
  return "noreply@averoai.com";
}

export class PostalService {
  private readonly env: NodeJS.ProcessEnv;
  private readonly db?: EmailSendsDb;
  private readonly nodemailer?: NodemailerLike;
  private readonly logger: Pick<Console, "info" | "warn" | "error">;
  private readonly config: ReturnType<typeof readEnvConfig>;

  constructor(options: PostalServiceOptions = {}) {
    this.env = options.env ?? process.env;
    this.db = options.db;
    this.nodemailer = options.nodemailer;
    this.logger = options.logger ?? console;
    this.config = readEnvConfig(this.env);
  }

  getProvider(): EmailProvider {
    if (this.config.host && this.config.apiKey) return "postal";
    if (this.config.smtpHost && this.nodemailer) return "smtp";
    return "console";
  }

  getConfigSummary(): {
    provider: EmailProvider;
    postalHost: string | null;
    postalConfigured: boolean;
    smtpHost: string | null;
    smtpConfigured: boolean;
    fromDomain: string | null;
    fromAddress: string;
  } {
    return {
      provider: this.getProvider(),
      postalHost: this.config.host ?? null,
      postalConfigured: Boolean(this.config.host && this.config.apiKey),
      smtpHost: this.config.smtpHost ?? null,
      smtpConfigured: Boolean(this.config.smtpHost),
      fromDomain: this.config.fromDomain ?? null,
      fromAddress: buildFrom(this.config.smtpFrom, this.config.fromDomain),
    };
  }

  async sendEmail(
    message: EmailMessage,
    context: { companyId: string; templateName?: EmailTemplate | null } = {
      companyId: "00000000-0000-0000-0000-000000000000",
    },
  ): Promise<SendResult> {
    const provider = this.getProvider();
    const from = buildFrom(this.config.smtpFrom, this.config.fromDomain, message.from);
    const timestamp = new Date().toISOString();
    let result: SendResult;
    try {
      if (provider === "postal") {
        result = await this.sendViaPostal({ ...message, from }, timestamp);
      } else if (provider === "smtp") {
        result = await this.sendViaSmtp({ ...message, from }, timestamp);
      } else {
        result = this.sendViaConsole({ ...message, from }, timestamp);
      }
    } catch (err) {
      const errMessage = err instanceof Error ? err.message : String(err);
      this.logger.error("[postal] send failed", errMessage);
      result = {
        messageId: `failed-${Date.now()}`,
        status: "failed",
        timestamp,
        provider,
        error: errMessage,
      };
    }

    if (this.db) {
      try {
        await this.db.insert({
          companyId: context.companyId,
          to: message.to,
          from,
          subject: message.subject,
          templateName: context.templateName ?? null,
          status: result.status,
          messageId: result.messageId,
          provider: result.provider,
          error: result.error ?? null,
        });
      } catch (err) {
        this.logger.warn(
          "[postal] failed to log email send:",
          err instanceof Error ? err.message : String(err),
        );
      }
    }
    return result;
  }

  async sendTemplate<T extends EmailTemplate>(
    templateName: T,
    to: string,
    variables: TemplateVarsMap[T],
    companyId: string,
  ): Promise<SendResult> {
    const rendered = renderTemplate(templateName, variables as unknown as Record<string, unknown>);
    return this.sendEmail(
      {
        to,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      },
      { companyId, templateName },
    );
  }

  async getEmailHistory(companyId: string, limit = 50): Promise<EmailHistoryRow[]> {
    if (!this.db) return [];
    return this.db.listByCompany(companyId, Math.min(Math.max(limit, 1), 500));
  }

  private async sendViaPostal(message: EmailMessage & { from: string }, timestamp: string): Promise<SendResult> {
    const host = this.config.host!;
    const url = `https://${host.replace(/^https?:\/\//, "").replace(/\/$/, "")}/api/v1/send/message`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Server-API-Key": this.config.apiKey!,
      },
      body: JSON.stringify({
        to: [message.to],
        from: message.from,
        sender: message.from,
        subject: message.subject,
        html_body: message.html,
        plain_body: message.text ?? "",
        reply_to: message.replyTo,
      }),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => "<no body>");
      throw new Error(`Postal API error ${response.status}: ${text}`);
    }
    const data = (await response.json().catch(() => ({}))) as {
      data?: { message_id?: string };
    };
    return {
      messageId: data.data?.message_id ?? `postal-${Date.now()}`,
      status: "sent",
      timestamp,
      provider: "postal",
    };
  }

  private async sendViaSmtp(message: EmailMessage & { from: string }, timestamp: string): Promise<SendResult> {
    if (!this.nodemailer) throw new Error("nodemailer transport not provided");
    const transport = this.nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort ?? 587,
      secure: (this.config.smtpPort ?? 587) === 465,
      auth:
        this.config.smtpUser && this.config.smtpPass
          ? { user: this.config.smtpUser, pass: this.config.smtpPass }
          : undefined,
    });
    const info = await transport.sendMail({
      from: message.from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      replyTo: message.replyTo,
    });
    return {
      messageId: info.messageId ?? `smtp-${Date.now()}`,
      status: "sent",
      timestamp,
      provider: "smtp",
    };
  }

  private sendViaConsole(message: EmailMessage & { from: string }, timestamp: string): SendResult {
    this.logger.info("[postal:dev] email would be sent:", {
      from: message.from,
      to: message.to,
      subject: message.subject,
      textPreview: (message.text ?? "").slice(0, 120),
    });
    return {
      messageId: `console-${Date.now()}`,
      status: "sent",
      timestamp,
      provider: "console",
    };
  }
}

let singleton: PostalService | null = null;
export function getDefaultPostalService(options?: PostalServiceOptions): PostalService {
  if (!singleton) singleton = new PostalService(options);
  return singleton;
}

export function resetDefaultPostalService(): void {
  singleton = null;
}
