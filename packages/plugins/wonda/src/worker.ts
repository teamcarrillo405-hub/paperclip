import { definePlugin, type ToolResult } from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";
import { WondaExecutor } from "./wonda-executor.js";
import { WondaNotInstalledError } from "./wonda-service.js";
import { InMemoryCampaignStore, type CampaignStore } from "./campaigns.js";
import {
  generateAudioJingle,
  generateCampaign,
  generateProductImage,
  generatePromoVideo,
  getCampaignStatus,
  listCampaigns,
  postCampaignContent,
  runCompetitorAnalysis,
  type WondaToolContext,
} from "./tools.js";
import type {
  CompetitorAnalysisInput,
  GenerateAudioJingleInput,
  GenerateCampaignInput,
  GenerateProductImageInput,
  GeneratePromoVideoInput,
  PostCampaignContentInput,
  WondaPlatform,
  WondaTone,
} from "./types.js";

function toolError(err: unknown): ToolResult {
  if (err instanceof WondaNotInstalledError) {
    return {
      error: err.message,
      data: { setupInstructions: err.setupInstructions },
    };
  }
  if (err instanceof Error) {
    return { error: `Wonda plugin error: ${err.message}` };
  }
  return { error: `Wonda plugin error: ${String(err)}` };
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string" && x.length > 0);
}

/**
 * Worker-side shared state. We keep a single executor and an in-memory store;
 * production deployments swap the store for a drizzle-backed one via
 * `definePlugin` config — see server/src/routes/marketing.ts for the
 * companion server-side wiring.
 */
const executor = new WondaExecutor({
  env: {
    WONDA_API_KEY: process.env.WONDA_API_KEY,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  },
});
const store: CampaignStore = new InMemoryCampaignStore();

function ctxFor(companyId: string): WondaToolContext {
  return { executor, store, companyId };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Wonda plugin setup starting");

    ctx.tools.register(
      TOOL_NAMES.runCompetitorAnalysis,
      {
        displayName: "Wonda: Competitor Analysis",
        description:
          "Scrape competitor sites and produce a positioning report plus 5 differentiated social posts.",
        parametersSchema: {
          type: "object",
          properties: {
            competitorUrls: { type: "array", items: { type: "string" } },
          },
          required: ["competitorUrls"],
        },
      },
      async (params, runCtx) => {
        try {
          const input: CompetitorAnalysisInput = {
            competitorUrls: asStringArray((params as Record<string, unknown>)?.competitorUrls),
          };
          const result = await runCompetitorAnalysis(ctxFor(runCtx.companyId), input);
          return { content: `Competitor analysis ready (campaign ${result.campaign.id}).`, data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.generateCampaign,
      {
        displayName: "Wonda: Generate Social Campaign",
        description:
          "Generate a full social campaign (images, captions, schedule) for the given topic/platforms/tone.",
        parametersSchema: {
          type: "object",
          properties: {
            topic: { type: "string" },
            platforms: { type: "array", items: { type: "string" } },
            tone: { type: "string" },
          },
          required: ["topic", "platforms"],
        },
      },
      async (params, runCtx) => {
        try {
          const p = (params ?? {}) as Record<string, unknown>;
          const input: GenerateCampaignInput = {
            topic: asString(p.topic) ?? "",
            platforms: asStringArray(p.platforms) as WondaPlatform[],
            tone: asString(p.tone) as WondaTone | undefined,
          };
          const result = await generateCampaign(ctxFor(runCtx.companyId), input);
          return { content: `Campaign "${result.campaignName}" ready.`, data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.generateProductImage,
      {
        displayName: "Wonda: Generate Product Image",
        description: "Generate a single product marketing image.",
        parametersSchema: {
          type: "object",
          properties: {
            description: { type: "string" },
            style: { type: "string" },
          },
          required: ["description"],
        },
      },
      async (params, runCtx) => {
        try {
          const p = (params ?? {}) as Record<string, unknown>;
          const input: GenerateProductImageInput = {
            description: asString(p.description) ?? "",
            style: asString(p.style) as GenerateProductImageInput["style"],
          };
          const result = await generateProductImage(ctxFor(runCtx.companyId), input);
          return { content: `Generated ${result.assets.length} image asset(s).`, data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.generatePromoVideo,
      {
        displayName: "Wonda: Generate Promo Video",
        description: "Generate a short promo video from a script via the wonda CLI.",
        parametersSchema: {
          type: "object",
          properties: {
            script: { type: "string" },
            voiceStyle: { type: "string" },
          },
          required: ["script"],
        },
      },
      async (params, runCtx) => {
        try {
          const p = (params ?? {}) as Record<string, unknown>;
          const input: GeneratePromoVideoInput = {
            script: asString(p.script) ?? "",
            voiceStyle: asString(p.voiceStyle) as GeneratePromoVideoInput["voiceStyle"],
          };
          const result = await generatePromoVideo(ctxFor(runCtx.companyId), input);
          return { content: `Generated ${result.assets.length} video asset(s).`, data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.generateAudioJingle,
      {
        displayName: "Wonda: Generate Audio Jingle",
        description: "Generate a short audio jingle via Suno.",
        parametersSchema: {
          type: "object",
          properties: { description: { type: "string" } },
          required: ["description"],
        },
      },
      async (params, runCtx) => {
        try {
          const p = (params ?? {}) as Record<string, unknown>;
          const input: GenerateAudioJingleInput = {
            description: asString(p.description) ?? "",
          };
          const result = await generateAudioJingle(ctxFor(runCtx.companyId), input);
          return { content: `Generated ${result.assets.length} audio asset(s).`, data: result };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.postCampaignContent,
      {
        displayName: "Wonda: Post Campaign",
        description: "Publish the assets of a campaign to the given social platforms.",
        parametersSchema: {
          type: "object",
          properties: {
            campaignId: { type: "string" },
            platforms: { type: "array", items: { type: "string" } },
          },
          required: ["campaignId", "platforms"],
        },
      },
      async (params, runCtx) => {
        try {
          const p = (params ?? {}) as Record<string, unknown>;
          const input: PostCampaignContentInput = {
            campaignId: asString(p.campaignId) ?? "",
            platforms: asStringArray(p.platforms) as WondaPlatform[],
          };
          const result = await postCampaignContent(ctxFor(runCtx.companyId), input);
          return {
            content: `Posted campaign ${input.campaignId} to ${result.posted.length}/${input.platforms.length} platforms.`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCampaignStatus,
      {
        displayName: "Wonda: Get Campaign Status",
        description: "Check async generation status for a campaign.",
        parametersSchema: {
          type: "object",
          properties: { campaignId: { type: "string" } },
          required: ["campaignId"],
        },
      },
      async (params, runCtx) => {
        try {
          const p = (params ?? {}) as Record<string, unknown>;
          const campaignId = asString(p.campaignId) ?? "";
          const record = await getCampaignStatus(ctxFor(runCtx.companyId), { campaignId });
          return { content: `Campaign ${campaignId} status: ${record.status}.`, data: record };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listCampaigns,
      {
        displayName: "Wonda: List Campaigns",
        description: "List all campaigns for the current company.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        try {
          const records = await listCampaigns(ctxFor(runCtx.companyId));
          return { content: `Found ${records.length} campaign(s).`, data: records };
        } catch (err) {
          return toolError(err);
        }
      },
    );
  },

  async onHealth() {
    const availability = await executor.getService().checkAvailability();
    return {
      status: availability.installed ? "ok" : "degraded",
      details: {
        wondaInstalled: availability.installed,
        binaryPath: availability.binaryPath,
        version: availability.version,
      },
    };
  },
});

export default plugin;
