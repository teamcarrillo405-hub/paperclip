import type { PluginContext, ToolResult } from "@paperclipai/plugin-sdk";
import type { EmailOAuthTokens, EmailProvider } from "../types.js";
import {
  ensureFreshGmailTokens,
  type GmailOAuthConfig,
} from "../providers/gmail.js";
import {
  ensureFreshOutlookTokens,
  type OutlookOAuthConfig,
} from "../providers/outlook.js";

export const TOKEN_NAMESPACE = "email-oauth";

function readEnv(key: string): string {
  const value = process.env[key];
  return typeof value === "string" ? value : "";
}

export function gmailConfig(): GmailOAuthConfig {
  return {
    clientId: readEnv("GMAIL_CLIENT_ID"),
    clientSecret: readEnv("GMAIL_CLIENT_SECRET"),
    redirectUri: readEnv("EMAIL_REDIRECT_URI"),
  };
}

export function outlookConfig(): OutlookOAuthConfig {
  return {
    clientId: readEnv("OUTLOOK_CLIENT_ID"),
    clientSecret: readEnv("OUTLOOK_CLIENT_SECRET"),
    redirectUri: readEnv("EMAIL_REDIRECT_URI"),
  };
}

export function tokenStateKey(companyId: string, provider: EmailProvider): string {
  return `${companyId}:${provider}`;
}

function isTokens(value: unknown): value is EmailOAuthTokens {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.accessToken === "string" &&
    typeof v.provider === "string" &&
    typeof v.expiresAt === "number" &&
    typeof v.emailAddress === "string"
  );
}

async function loadProviderTokens(
  ctx: PluginContext,
  companyId: string,
  provider: EmailProvider,
): Promise<EmailOAuthTokens | null> {
  const raw = await ctx.state.get({
    scopeKind: "company",
    scopeId: companyId,
    namespace: TOKEN_NAMESPACE,
    stateKey: provider,
  });
  if (!isTokens(raw)) return null;
  return raw;
}

async function saveProviderTokens(
  ctx: PluginContext,
  companyId: string,
  tokens: EmailOAuthTokens,
): Promise<void> {
  await ctx.state.set(
    {
      scopeKind: "company",
      scopeId: companyId,
      namespace: TOKEN_NAMESPACE,
      stateKey: tokens.provider,
    },
    tokens as unknown as Record<string, unknown>,
  );
}

export async function loadConnectedTokens(
  ctx: PluginContext,
  companyId: string,
): Promise<EmailOAuthTokens | null> {
  const gmail = await loadProviderTokens(ctx, companyId, "gmail");
  if (gmail) {
    const refreshed = await ensureFreshGmailTokens(gmailConfig(), gmail);
    if (refreshed !== gmail) await saveProviderTokens(ctx, companyId, refreshed);
    return refreshed;
  }
  const outlook = await loadProviderTokens(ctx, companyId, "outlook");
  if (outlook) {
    const refreshed = await ensureFreshOutlookTokens(outlookConfig(), outlook);
    if (refreshed !== outlook) await saveProviderTokens(ctx, companyId, refreshed);
    return refreshed;
  }
  return null;
}

export function toolError(message: string): ToolResult {
  return { error: message };
}

export function notConnectedError(): ToolResult {
  return toolError(
    "No email provider is connected for this company. Ask an admin to connect Gmail or Outlook in Settings > Integrations.",
  );
}
