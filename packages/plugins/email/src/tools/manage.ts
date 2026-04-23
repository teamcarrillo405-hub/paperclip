import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import { markGmailRead, moveGmailToFolder } from "../providers/gmail.js";
import { markOutlookRead, moveOutlookToFolder } from "../providers/outlook.js";
import { loadConnectedTokens, notConnectedError } from "./shared.js";

export async function emailMarkRead(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { messageId?: string },
): Promise<ToolResult> {
  if (!params.messageId) return { error: "messageId is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const markFn = tokens.provider === "gmail" ? markGmailRead : markOutlookRead;
  await markFn(tokens, params.messageId);
  return {
    content: `Marked message ${params.messageId} as read`,
    data: { provider: tokens.provider, messageId: params.messageId },
  };
}

export async function emailMoveToFolder(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { messageId?: string; folder?: string },
): Promise<ToolResult> {
  if (!params.messageId) return { error: "messageId is required" };
  if (!params.folder) return { error: "folder is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const moveFn = tokens.provider === "gmail" ? moveGmailToFolder : moveOutlookToFolder;
  await moveFn(tokens, params.messageId, params.folder);
  return {
    content: `Moved message ${params.messageId} to ${params.folder}`,
    data: { provider: tokens.provider, messageId: params.messageId, folder: params.folder },
  };
}
