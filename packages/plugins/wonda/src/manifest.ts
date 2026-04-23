import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.wonda";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  runCompetitorAnalysis: "wonda_run_competitor_analysis",
  generateCampaign: "wonda_generate_campaign",
  generateProductImage: "wonda_generate_product_image",
  generatePromoVideo: "wonda_generate_promo_video",
  generateAudioJingle: "wonda_generate_audio_jingle",
  postCampaignContent: "wonda_post_campaign_content",
  getCampaignStatus: "wonda_get_campaign_status",
  listCampaigns: "wonda_list_campaigns",
} as const;

const PLATFORMS = [
  "instagram",
  "linkedin",
  "x",
  "twitter",
  "reddit",
  "tiktok",
  "facebook",
  "youtube",
];

const TONES = ["professional", "casual", "exciting", "informative", "playful", "bold"];

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Wonda Marketing Studio",
  description:
    "Wonda CLI marketing agent — chains 20+ AI models (Sora, ElevenLabs, Kling, Suno) into competitor analysis, social campaigns, promo videos, and launch kits.",
  author: "Avero AI",
  categories: ["connector", "automation"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.runCompetitorAnalysis,
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
    {
      name: TOOL_NAMES.generateCampaign,
      displayName: "Wonda: Generate Social Campaign",
      description:
        "Generate a full social campaign (images, captions, schedule) for the given topic, platforms, and tone.",
      parametersSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
          platforms: { type: "array", items: { type: "string", enum: PLATFORMS } },
          tone: { type: "string", enum: TONES },
        },
        required: ["topic", "platforms"],
      },
    },
    {
      name: TOOL_NAMES.generateProductImage,
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
    {
      name: TOOL_NAMES.generatePromoVideo,
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
    {
      name: TOOL_NAMES.generateAudioJingle,
      displayName: "Wonda: Generate Audio Jingle",
      description: "Generate a short audio jingle via Suno.",
      parametersSchema: {
        type: "object",
        properties: { description: { type: "string" } },
        required: ["description"],
      },
    },
    {
      name: TOOL_NAMES.postCampaignContent,
      displayName: "Wonda: Post Campaign",
      description: "Publish the assets of a campaign to the given social platforms.",
      parametersSchema: {
        type: "object",
        properties: {
          campaignId: { type: "string" },
          platforms: { type: "array", items: { type: "string", enum: PLATFORMS } },
        },
        required: ["campaignId", "platforms"],
      },
    },
    {
      name: TOOL_NAMES.getCampaignStatus,
      displayName: "Wonda: Get Campaign Status",
      description: "Check async generation status for a campaign.",
      parametersSchema: {
        type: "object",
        properties: { campaignId: { type: "string" } },
        required: ["campaignId"],
      },
    },
    {
      name: TOOL_NAMES.listCampaigns,
      displayName: "Wonda: List Campaigns",
      description: "List all campaigns for the current company.",
      parametersSchema: { type: "object", properties: {} },
    },
  ],
};

export default manifest;
