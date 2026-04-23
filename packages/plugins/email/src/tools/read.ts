import type { PluginContext, ToolResult, ToolRunContext } from "@paperclipai/plugin-sdk";
import {
  getGmailMessage,
  getGmailThread,
  listGmailInbox,
  searchGmail,
} from "../providers/gmail.js";
import {
  getOutlookMessage,
  getOutlookThread,
  listOutlookInbox,
  searchOutlook,
} from "../providers/outlook.js";
import { loadConnectedTokens, notConnectedError } from "./shared.js";

export async function emailListInbox(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { limit?: number; unreadOnly?: boolean; folder?: string },
): Promise<ToolResult> {
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const listFn = tokens.provider === "gmail" ? listGmailInbox : listOutlookInbox;
  const summaries = await listFn(tokens, {
    limit: params.limit,
    unreadOnly: params.unreadOnly,
    folder: params.folder,
  });
  return {
    content: `Found ${summaries.length} messages`,
    data: { provider: tokens.provider, messages: summaries },
  };
}

export async function emailGetMessage(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { messageId?: string },
): Promise<ToolResult> {
  if (!params.messageId) return { error: "messageId is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const getFn = tokens.provider === "gmail" ? getGmailMessage : getOutlookMessage;
  const message = await getFn(tokens, params.messageId);
  return {
    content: `Fetched message "${message.subject}" from ${message.from}`,
    data: { provider: tokens.provider, message },
  };
}

export async function emailSearch(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { query?: string; limit?: number },
): Promise<ToolResult> {
  if (!params.query) return { error: "query is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const searchFn = tokens.provider === "gmail" ? searchGmail : searchOutlook;
  const results = await searchFn(tokens, params.query, params.limit ?? 20);
  return {
    content: `Search matched ${results.length} messages`,
    data: { provider: tokens.provider, messages: results },
  };
}

export async function emailGetThread(
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: { threadId?: string },
): Promise<ToolResult> {
  if (!params.threadId) return { error: "threadId is required" };
  const tokens = await loadConnectedTokens(ctx, runCtx.companyId);
  if (!tokens) return notConnectedError();
  const getFn = tokens.provider === "gmail" ? getGmailThread : getOutlookThread;
  const thread = await getFn(tokens, params.threadId);
  return {
    content: `Thread has ${thread.messages.length} messages`,
    data: { provider: tokens.provider, thread },
  };
}
