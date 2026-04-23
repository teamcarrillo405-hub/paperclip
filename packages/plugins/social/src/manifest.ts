import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.social";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  schedulePost: "social_schedule_post",
  publishNow: "social_publish_now",
  listScheduledPosts: "social_list_scheduled_posts",
  cancelPost: "social_cancel_post",
  getPostAnalytics: "social_get_post_analytics",
  generatePostContent: "social_generate_post_content",
  respondToComment: "social_respond_to_comment",
  getRecentComments: "social_get_recent_comments",
  updateGoogleBusiness: "social_update_google_business",
  getSocialStats: "social_get_social_stats",
} as const;

const PLATFORM_ENUM = ["instagram", "linkedin", "x", "reddit", "google_business"];
const TONE_ENUM = [
  "professional",
  "casual",
  "playful",
  "authoritative",
  "enthusiastic",
  "empathetic",
];

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Social Media (Postiz)",
  description:
    "Schedules, publishes and analyzes posts on Instagram, LinkedIn, X, Reddit and Google Business via a self-hosted Postiz instance. Generates platform-optimized content with OpenAI.",
  author: "Avero AI",
  categories: ["connector", "automation"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.schedulePost,
      displayName: "Social: Schedule Post",
      description:
        "Schedule a post to one or more social platforms at a future ISO-8601 timestamp.",
      parametersSchema: {
        type: "object",
        properties: {
          platforms: {
            type: "array",
            items: { type: "string", enum: PLATFORM_ENUM },
          },
          content: { type: "string" },
          scheduledAt: { type: "string" },
          mediaUrl: { type: "string" },
        },
        required: ["platforms", "content", "scheduledAt"],
      },
    },
    {
      name: TOOL_NAMES.publishNow,
      displayName: "Social: Publish Now",
      description: "Publish a post to one or more social platforms immediately.",
      parametersSchema: {
        type: "object",
        properties: {
          platforms: {
            type: "array",
            items: { type: "string", enum: PLATFORM_ENUM },
          },
          content: { type: "string" },
          mediaUrl: { type: "string" },
        },
        required: ["platforms", "content"],
      },
    },
    {
      name: TOOL_NAMES.listScheduledPosts,
      displayName: "Social: List Scheduled Posts",
      description: "List scheduled and recently published posts from Postiz.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
        },
      },
    },
    {
      name: TOOL_NAMES.cancelPost,
      displayName: "Social: Cancel Post",
      description: "Cancel a previously scheduled post by its Postiz post id.",
      parametersSchema: {
        type: "object",
        properties: {
          postId: { type: "string" },
        },
        required: ["postId"],
      },
    },
    {
      name: TOOL_NAMES.getPostAnalytics,
      displayName: "Social: Get Post Analytics",
      description:
        "Fetch impressions, likes, comments, shares and engagement rate for a published post.",
      parametersSchema: {
        type: "object",
        properties: {
          postId: { type: "string" },
        },
        required: ["postId"],
      },
    },
    {
      name: TOOL_NAMES.generatePostContent,
      displayName: "Social: Generate Post Content",
      description:
        "Generate platform-optimized post drafts for the given topic, tone and platforms using OpenAI.",
      parametersSchema: {
        type: "object",
        properties: {
          topic: { type: "string" },
          tone: { type: "string", enum: TONE_ENUM },
          platforms: {
            type: "array",
            items: { type: "string", enum: PLATFORM_ENUM },
          },
        },
        required: ["topic", "tone", "platforms"],
      },
    },
    {
      name: TOOL_NAMES.respondToComment,
      displayName: "Social: Respond to Comment",
      description:
        "Post a reply to a comment on a given platform via Postiz's comment-response endpoint.",
      parametersSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: PLATFORM_ENUM },
          commentId: { type: "string" },
          response: { type: "string" },
        },
        required: ["platform", "commentId", "response"],
      },
    },
    {
      name: TOOL_NAMES.getRecentComments,
      displayName: "Social: Get Recent Comments",
      description: "Fetch recent unreplied comments for a given platform.",
      parametersSchema: {
        type: "object",
        properties: {
          platform: { type: "string", enum: PLATFORM_ENUM },
          limit: { type: "number" },
        },
        required: ["platform"],
      },
    },
    {
      name: TOOL_NAMES.updateGoogleBusiness,
      displayName: "Social: Update Google Business",
      description:
        "Publish a Google Business Profile update (offer, event, or local-business announcement).",
      parametersSchema: {
        type: "object",
        properties: {
          summary: { type: "string" },
          callToAction: {
            type: "object",
            properties: {
              label: { type: "string" },
              url: { type: "string" },
            },
          },
          mediaUrl: { type: "string" },
          eventStart: { type: "string" },
          eventEnd: { type: "string" },
        },
        required: ["summary"],
      },
    },
    {
      name: TOOL_NAMES.getSocialStats,
      displayName: "Social: Get Social Stats",
      description:
        "Aggregate scheduled/published/failed counts and per-platform post counts across the connected account.",
      parametersSchema: { type: "object", properties: {} },
    },
  ],
};

export default manifest;
