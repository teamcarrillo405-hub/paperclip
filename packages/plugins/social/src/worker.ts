import {
  definePlugin,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";
import { SocialService } from "./social-service.js";
import type {
  SocialContentTone,
  SocialPlatform,
} from "./types.js";

const VALID_PLATFORMS: SocialPlatform[] = [
  "instagram",
  "linkedin",
  "x",
  "reddit",
  "google_business",
];
const VALID_TONES: SocialContentTone[] = [
  "professional",
  "casual",
  "playful",
  "authoritative",
  "enthusiastic",
  "empathetic",
];

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Social plugin misconfigured: ${name} is not set`);
  }
  return value;
}

function serviceFromEnv(): SocialService {
  return new SocialService({
    postizBaseUrl: requiredEnv("POSTIZ_INTERNAL_URL"),
    postizApiKey: requiredEnv("POSTIZ_API_KEY"),
    openaiApiKey: process.env.OPENAI_API_KEY,
  });
}

function toolError(err: unknown): ToolResult {
  if (err instanceof Error) {
    return { error: `Social plugin error: ${err.message}` };
  }
  return { error: `Social plugin error: ${String(err)}` };
}

function extractString(params: unknown, key: string): string | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function extractNumber(params: unknown, key: string): number | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function extractObject(params: unknown, key: string): Record<string, unknown> | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return undefined;
}

function extractPlatforms(params: unknown): SocialPlatform[] {
  if (!params || typeof params !== "object") return [];
  const raw = (params as Record<string, unknown>).platforms;
  if (!Array.isArray(raw)) return [];
  const out: SocialPlatform[] = [];
  for (const v of raw) {
    if (typeof v === "string" && (VALID_PLATFORMS as string[]).includes(v)) {
      out.push(v as SocialPlatform);
    }
  }
  return out;
}

function extractPlatform(params: unknown, key = "platform"): SocialPlatform | undefined {
  const s = extractString(params, key);
  if (s && (VALID_PLATFORMS as string[]).includes(s)) return s as SocialPlatform;
  return undefined;
}

function extractTone(params: unknown): SocialContentTone | undefined {
  const s = extractString(params, "tone");
  if (s && (VALID_TONES as string[]).includes(s)) return s as SocialContentTone;
  return undefined;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Social plugin setup starting");

    ctx.tools.register(
      TOOL_NAMES.schedulePost,
      {
        displayName: "Social: Schedule Post",
        description:
          "Schedule a post to one or more social platforms at a future ISO-8601 timestamp.",
        parametersSchema: {
          type: "object",
          properties: {
            platforms: { type: "array" },
            content: { type: "string" },
            scheduledAt: { type: "string" },
            mediaUrl: { type: "string" },
          },
          required: ["platforms", "content", "scheduledAt"],
        },
      },
      async (params) => {
        const platforms = extractPlatforms(params);
        const content = extractString(params, "content");
        const scheduledAt = extractString(params, "scheduledAt");
        if (platforms.length === 0) return { error: "`platforms` must be a non-empty array" };
        if (!content) return { error: "`content` is required" };
        if (!scheduledAt) return { error: "`scheduledAt` is required (ISO-8601)" };
        try {
          const service = serviceFromEnv();
          const post = await service.schedulePost({
            platforms,
            content,
            scheduledAt,
            mediaUrl: extractString(params, "mediaUrl"),
          });
          return {
            content: `Scheduled post ${post.id} to ${platforms.join(", ")} at ${scheduledAt}.`,
            data: post,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.publishNow,
      {
        displayName: "Social: Publish Now",
        description: "Publish a post immediately to one or more platforms.",
        parametersSchema: {
          type: "object",
          properties: {
            platforms: { type: "array" },
            content: { type: "string" },
            mediaUrl: { type: "string" },
          },
          required: ["platforms", "content"],
        },
      },
      async (params) => {
        const platforms = extractPlatforms(params);
        const content = extractString(params, "content");
        if (platforms.length === 0) return { error: "`platforms` must be a non-empty array" };
        if (!content) return { error: "`content` is required" };
        try {
          const service = serviceFromEnv();
          const post = await service.publishNow({
            platforms,
            content,
            mediaUrl: extractString(params, "mediaUrl"),
          });
          return {
            content: `Published post ${post.id} to ${platforms.join(", ")}.`,
            data: post,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listScheduledPosts,
      {
        displayName: "Social: List Scheduled Posts",
        description: "List scheduled and recently published posts.",
        parametersSchema: {
          type: "object",
          properties: { limit: { type: "number" } },
        },
      },
      async (params) => {
        try {
          const service = serviceFromEnv();
          const posts = await service.listScheduledPosts(extractNumber(params, "limit"));
          return {
            content: `Found ${posts.length} posts.`,
            data: posts,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.cancelPost,
      {
        displayName: "Social: Cancel Post",
        description: "Cancel a previously scheduled post by id.",
        parametersSchema: {
          type: "object",
          properties: { postId: { type: "string" } },
          required: ["postId"],
        },
      },
      async (params) => {
        const postId = extractString(params, "postId");
        if (!postId) return { error: "`postId` is required" };
        try {
          const service = serviceFromEnv();
          await service.cancelPost(postId);
          return { content: `Cancelled post ${postId}.`, data: { postId, cancelled: true } };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getPostAnalytics,
      {
        displayName: "Social: Get Post Analytics",
        description: "Fetch engagement analytics for a published post.",
        parametersSchema: {
          type: "object",
          properties: { postId: { type: "string" } },
          required: ["postId"],
        },
      },
      async (params) => {
        const postId = extractString(params, "postId");
        if (!postId) return { error: "`postId` is required" };
        try {
          const service = serviceFromEnv();
          const analytics = await service.getPostAnalytics(postId);
          return {
            content: `Analytics for post ${postId}: ${analytics.impressions ?? 0} impressions, ${analytics.likes ?? 0} likes.`,
            data: analytics,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.generatePostContent,
      {
        displayName: "Social: Generate Post Content",
        description: "Generate platform-optimized drafts for the given topic.",
        parametersSchema: {
          type: "object",
          properties: {
            topic: { type: "string" },
            tone: { type: "string" },
            platforms: { type: "array" },
          },
          required: ["topic", "tone", "platforms"],
        },
      },
      async (params) => {
        const topic = extractString(params, "topic");
        const tone = extractTone(params);
        const platforms = extractPlatforms(params);
        if (!topic) return { error: "`topic` is required" };
        if (!tone) return { error: "`tone` must be one of " + VALID_TONES.join(", ") };
        if (platforms.length === 0) return { error: "`platforms` must be a non-empty array" };
        try {
          const service = serviceFromEnv();
          const drafts = await service.generatePostContent({ topic, tone, platforms });
          return {
            content: `Generated ${drafts.length} draft(s).`,
            data: drafts,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.respondToComment,
      {
        displayName: "Social: Respond to Comment",
        description: "Post a reply to a social-media comment.",
        parametersSchema: {
          type: "object",
          properties: {
            platform: { type: "string" },
            commentId: { type: "string" },
            response: { type: "string" },
          },
          required: ["platform", "commentId", "response"],
        },
      },
      async (params) => {
        const platform = extractPlatform(params);
        const commentId = extractString(params, "commentId");
        const response = extractString(params, "response");
        if (!platform) return { error: "`platform` is required" };
        if (!commentId) return { error: "`commentId` is required" };
        if (!response) return { error: "`response` is required" };
        try {
          const service = serviceFromEnv();
          await service.respondToComment(platform, commentId, response);
          return {
            content: `Reply posted to ${platform} comment ${commentId}.`,
            data: { platform, commentId, response },
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getRecentComments,
      {
        displayName: "Social: Get Recent Comments",
        description: "Fetch recent comments for a given platform.",
        parametersSchema: {
          type: "object",
          properties: {
            platform: { type: "string" },
            limit: { type: "number" },
          },
          required: ["platform"],
        },
      },
      async (params) => {
        const platform = extractPlatform(params);
        if (!platform) return { error: "`platform` is required" };
        try {
          const service = serviceFromEnv();
          const comments = await service.getRecentComments(
            platform,
            extractNumber(params, "limit"),
          );
          return {
            content: `Found ${comments.length} comments on ${platform}.`,
            data: comments,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.updateGoogleBusiness,
      {
        displayName: "Social: Update Google Business",
        description: "Publish a Google Business Profile update.",
        parametersSchema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            callToAction: { type: "object" },
            mediaUrl: { type: "string" },
            eventStart: { type: "string" },
            eventEnd: { type: "string" },
          },
          required: ["summary"],
        },
      },
      async (params) => {
        const summary = extractString(params, "summary");
        if (!summary) return { error: "`summary` is required" };
        const cta = extractObject(params, "callToAction");
        try {
          const service = serviceFromEnv();
          const post = await service.updateGoogleBusiness({
            summary,
            callToAction: cta
              ? {
                label: typeof cta.label === "string" ? cta.label : undefined,
                url: typeof cta.url === "string" ? cta.url : undefined,
              }
              : undefined,
            mediaUrl: extractString(params, "mediaUrl"),
            eventStart: extractString(params, "eventStart"),
            eventEnd: extractString(params, "eventEnd"),
          });
          return {
            content: `Published Google Business update ${post.id}.`,
            data: post,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getSocialStats,
      {
        displayName: "Social: Get Social Stats",
        description: "Aggregate posting statistics across the connected account.",
        parametersSchema: { type: "object", properties: {} },
      },
      async () => {
        try {
          const service = serviceFromEnv();
          const stats = await service.getSocialStats();
          return {
            content: `${stats.scheduled} scheduled, ${stats.published} published, ${stats.failed} failed.`,
            data: stats,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.logger.info("Social plugin setup complete");
  },

  async onHealth() {
    const hasPostizUrl =
      typeof process.env.POSTIZ_INTERNAL_URL === "string" && process.env.POSTIZ_INTERNAL_URL.length > 0;
    const hasPostizKey =
      typeof process.env.POSTIZ_API_KEY === "string" && process.env.POSTIZ_API_KEY.length > 0;
    if (!hasPostizUrl || !hasPostizKey) {
      return {
        status: "degraded",
        message:
          "POSTIZ_INTERNAL_URL and/or POSTIZ_API_KEY environment variables are missing.",
      };
    }
    return { status: "ok", message: "Social plugin configured." };
  },
});

export default plugin;
