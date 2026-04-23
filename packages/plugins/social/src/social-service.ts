import { createContentGenerator, type ContentGenerator } from "./content-generator.js";
import { createPostizClient, type PostizClient } from "./postiz-client.js";
import type {
  GeneratePostContentInput,
  GeneratedPost,
  GoogleBusinessUpdateInput,
  PublishNowInput,
  ScheduledPostInput,
  SocialComment,
  SocialPlatform,
  SocialPostAnalytics,
  SocialPostSummary,
  SocialStats,
} from "./types.js";

export interface SocialServiceOptions {
  postizBaseUrl: string;
  postizApiKey: string;
  openaiApiKey?: string;
  openaiModel?: string;
  fetchImpl?: typeof fetch;
}

const ALL_PLATFORMS: SocialPlatform[] = [
  "instagram",
  "linkedin",
  "x",
  "reddit",
  "google_business",
];

/**
 * Coordinates the Postiz HTTP client and the OpenAI content generator.
 *
 * This is intentionally transport-agnostic: it accepts plain inputs and
 * returns plain summaries, so it can be driven from agent tools, the
 * Paperclip server's REST routes, or tests.
 */
export class SocialService {
  readonly postiz: PostizClient;
  private readonly generator?: ContentGenerator;

  constructor(opts: SocialServiceOptions) {
    this.postiz = createPostizClient({
      baseUrl: opts.postizBaseUrl,
      apiKey: opts.postizApiKey,
      fetchImpl: opts.fetchImpl,
    });
    if (opts.openaiApiKey && opts.openaiApiKey.length > 0) {
      this.generator = createContentGenerator({
        apiKey: opts.openaiApiKey,
        model: opts.openaiModel,
        fetchImpl: opts.fetchImpl,
      });
    }
  }

  async schedulePost(input: ScheduledPostInput): Promise<SocialPostSummary> {
    const res = await this.postiz.schedule({
      platforms: input.platforms,
      content: input.content,
      scheduledAt: input.scheduledAt,
      mediaUrl: input.mediaUrl,
    });
    return {
      id: res.id,
      postizPostId: res.id,
      platforms: res.platforms ?? input.platforms,
      content: res.content ?? input.content,
      status: this.postiz.mapStatus(res.status),
      scheduledAt: res.scheduledAt ?? input.scheduledAt,
      publishedAt: res.publishedAt,
      mediaUrl: res.mediaUrl ?? input.mediaUrl,
    };
  }

  async publishNow(input: PublishNowInput): Promise<SocialPostSummary> {
    const res = await this.postiz.publishNow({
      platforms: input.platforms,
      content: input.content,
      mediaUrl: input.mediaUrl,
    });
    return {
      id: res.id,
      postizPostId: res.id,
      platforms: res.platforms ?? input.platforms,
      content: res.content ?? input.content,
      status: this.postiz.mapStatus(res.status ?? "published"),
      scheduledAt: res.scheduledAt,
      publishedAt: res.publishedAt ?? new Date().toISOString(),
      mediaUrl: res.mediaUrl ?? input.mediaUrl,
    };
  }

  async listScheduledPosts(limit?: number): Promise<SocialPostSummary[]> {
    const rows = await this.postiz.list(limit);
    return rows.map((row) => ({
      id: row.id,
      postizPostId: row.id,
      platforms: row.platforms ?? [],
      content: row.content ?? "",
      status: this.postiz.mapStatus(row.status),
      scheduledAt: row.scheduledAt,
      publishedAt: row.publishedAt,
      mediaUrl: row.mediaUrl,
    }));
  }

  async cancelPost(postId: string): Promise<void> {
    await this.postiz.cancel(postId);
  }

  async getPostAnalytics(postId: string): Promise<SocialPostAnalytics> {
    return this.postiz.analytics(postId);
  }

  async generatePostContent(input: GeneratePostContentInput): Promise<GeneratedPost[]> {
    if (!this.generator) {
      throw new Error(
        "Social content generator is not configured: OPENAI_API_KEY is missing.",
      );
    }
    return this.generator.generate(input);
  }

  async respondToComment(
    platform: SocialPlatform,
    commentId: string,
    response: string,
  ): Promise<void> {
    await this.postiz.respondToComment(platform, commentId, response);
  }

  async getRecentComments(platform: SocialPlatform, limit?: number): Promise<SocialComment[]> {
    return this.postiz.recentComments(platform, limit);
  }

  async updateGoogleBusiness(update: GoogleBusinessUpdateInput): Promise<SocialPostSummary> {
    const contentParts = [update.summary];
    if (update.callToAction?.label && update.callToAction?.url) {
      contentParts.push(`${update.callToAction.label}: ${update.callToAction.url}`);
    } else if (update.callToAction?.url) {
      contentParts.push(update.callToAction.url);
    }
    return this.publishNow({
      platforms: ["google_business"],
      content: contentParts.join("\n\n"),
      mediaUrl: update.mediaUrl,
    });
  }

  async getSocialStats(): Promise<SocialStats> {
    const posts = await this.listScheduledPosts(500);
    const stats: SocialStats = {
      scheduled: 0,
      published: 0,
      failed: 0,
      cancelled: 0,
      platformBreakdown: {},
    };
    for (const p of posts) {
      stats[p.status] = (stats[p.status] ?? 0) + 1;
      for (const plat of p.platforms) {
        stats.platformBreakdown[plat] = (stats.platformBreakdown[plat] ?? 0) + 1;
      }
    }
    return stats;
  }
}

export function knownPlatforms(): SocialPlatform[] {
  return [...ALL_PLATFORMS];
}
