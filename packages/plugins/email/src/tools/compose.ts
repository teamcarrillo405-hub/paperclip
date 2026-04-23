import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { createGmailDraft, getGmailMessage, sendGmail } from "../providers/gmail.js";
import { createOutlookDraft, getOutlookMessage, sendOutlook } from "../providers/outlook.js";
import { loadConnectedTokens, notConnectedError } from "./shared.js";

export async function emailSend(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: {
    to?: string[];
    subject?: string;
    body?: string;
    cc?: string[];
    replyToMessageId?: string;
    confirmed?: boolean;
  },
): Promise<ToolResult> {
  if (!params.confirmed) {
    return {
      error: "email_send requires explicit { confirmed: true } — refusing to send without confirmation",
    };
  }
  if (!params.to || params.to.length === 0) return { error: "to is required" };
  if (!params.subject) return { error: "subject is required" };
  if (!params.body) return { error: "body is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const sendFn = tokens.provider === "gmail" ? sendGmail : sendOutlook;
  const result = await sendFn(tokens, {
    to: params.to,
    subject: params.subject,
    body: params.body,
    cc: params.cc,
    replyToMessageId: params.replyToMessageId,
  });
  await ctx.activity.log({
    companyId: runCtx.companyId,
    entityType: "email",
    entityId: ("id" in result && typeof result.id === "string" ? result.id : undefined) ?? "sent",
    message: `Agent sent email via ${tokens.provider}: "${params.subject}" to ${params.to.join(", ")}`,
    metadata: {
      provider: tokens.provider,
      from: tokens.emailAddress,
      to: params.to,
      subject: params.subject,
      replyTo: params.replyToMessageId,
    },
  });
  return {
    content: `Sent email via ${tokens.provider} to ${params.to.join(", ")}`,
    data: { provider: tokens.provider, ...result },
  };
}

export async function emailDraftReply(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { messageId?: string; draftBody?: string },
): Promise<ToolResult> {
  if (!params.messageId) return { error: "messageId is required" };
  if (!params.draftBody) return { error: "draftBody is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();

  const getFn = tokens.provider === "gmail" ? getGmailMessage : getOutlookMessage;
  const original = await getFn(tokens, params.messageId);
  const subject = original.subject.startsWith("Re:")
    ? original.subject
    : `Re: ${original.subject}`;
  const to = [original.from];

  const draftFn = tokens.provider === "gmail" ? createGmailDraft : createOutlookDraft;
  const draft = await draftFn(tokens, {
    to,
    subject,
    body: params.draftBody,
    replyToMessageId: params.messageId,
  });

  await ctx.activity.log({
    companyId: runCtx.companyId,
    entityType: "email_draft",
    entityId: draft.id,
    message: `Agent drafted reply via ${tokens.provider} to "${original.subject}" (awaiting approval)`,
    metadata: {
      provider: tokens.provider,
      draftId: draft.id,
      inReplyTo: params.messageId,
      to,
    },
  });

  return {
    content: `Created draft reply (id: ${draft.id}). This draft is NOT sent — a human must approve it before sending.`,
    data: { provider: tokens.provider, draftId: draft.id, requiresApproval: true },
  };
}

export async function emailCreateDraft(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { to?: string[]; subject?: string; body?: string; cc?: string[] },
): Promise<ToolResult> {
  if (!params.to || params.to.length === 0) return { error: "to is required" };
  if (!params.subject) return { error: "subject is required" };
  if (!params.body) return { error: "body is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const draftFn = tokens.provider === "gmail" ? createGmailDraft : createOutlookDraft;
  const draft = await draftFn(tokens, {
    to: params.to,
    subject: params.subject,
    body: params.body,
    cc: params.cc,
  });
  await ctx.activity.log({
    companyId: runCtx.companyId,
    entityType: "email_draft",
    entityId: draft.id,
    message: `Agent created draft via ${tokens.provider}: "${params.subject}"`,
    metadata: {
      provider: tokens.provider,
      draftId: draft.id,
      to: params.to,
      subject: params.subject,
    },
  });
  return {
    content: `Created draft (id: ${draft.id})`,
    data: { provider: tokens.provider, draftId: draft.id },
  };
}
