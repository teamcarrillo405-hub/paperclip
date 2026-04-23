import {
  definePlugin,
  runWorker,
  type PaperclipPlugin,
  type PluginContext,
  type ToolResult,
  type ToolRunContext,
} from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";
import { emailGetMessage, emailGetThread, emailListInbox, emailSearch } from "./tools/read.js";
import { emailCreateDraft, emailDraftReply, emailSend } from "./tools/compose.js";
import { emailMarkRead, emailMoveToFolder } from "./tools/manage.js";

type ToolHandler = (
  ctx: PluginContext,
  runCtx: ToolRunContext,
  params: Record<string, unknown>,
) => Promise<ToolResult>;

const HANDLERS: Record<string, ToolHandler> = {
  [TOOL_NAMES.listInbox]: (ctx, runCtx, params) =>
    emailListInbox(ctx, runCtx, params as Parameters<typeof emailListInbox>[2]),
  [TOOL_NAMES.getMessage]: (ctx, runCtx, params) =>
    emailGetMessage(ctx, runCtx, params as Parameters<typeof emailGetMessage>[2]),
  [TOOL_NAMES.search]: (ctx, runCtx, params) =>
    emailSearch(ctx, runCtx, params as Parameters<typeof emailSearch>[2]),
  [TOOL_NAMES.getThread]: (ctx, runCtx, params) =>
    emailGetThread(ctx, runCtx, params as Parameters<typeof emailGetThread>[2]),
  [TOOL_NAMES.send]: (ctx, runCtx, params) =>
    emailSend(ctx, runCtx, params as Parameters<typeof emailSend>[2]),
  [TOOL_NAMES.draftReply]: (ctx, runCtx, params) =>
    emailDraftReply(ctx, runCtx, params as Parameters<typeof emailDraftReply>[2]),
  [TOOL_NAMES.createDraft]: (ctx, runCtx, params) =>
    emailCreateDraft(ctx, runCtx, params as Parameters<typeof emailCreateDraft>[2]),
  [TOOL_NAMES.markRead]: (ctx, runCtx, params) =>
    emailMarkRead(ctx, runCtx, params as Parameters<typeof emailMarkRead>[2]),
  [TOOL_NAMES.moveToFolder]: (ctx, runCtx, params) =>
    emailMoveToFolder(ctx, runCtx, params as Parameters<typeof emailMoveToFolder>[2]),
};

const plugin: PaperclipPlugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("email plugin setup");

    for (const [name, handler] of Object.entries(HANDLERS)) {
      ctx.tools.register(
        name,
        { displayName: name, description: `Email tool: ${name}`, parametersSchema: { type: "object", properties: {}, additionalProperties: true } },
        async (params, runCtx) => {
          try {
            return await handler(ctx, runCtx, (params ?? {}) as Record<string, unknown>);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            return { error: `email tool ${name} failed: ${message}` };
          }
        },
      );
    }
  },

  async onHealth() {
    return { status: "ok", message: "email plugin ready" };
  },
});

export default plugin;
runWorker(plugin, import.meta.url);
