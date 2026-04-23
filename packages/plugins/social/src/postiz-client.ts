import type {
  SocialComment,
  SocialPlatform,
  SocialPostAnalytics,
  SocialPostStatus,
} from "./types.js";

export interface PostizClientOptions {
  baseUrl: string;
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export class PostizApiError extends Error {
  readonly status: number;
  readonly details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "PostizApiError";
    this.status = status;
    this.details = details;
  }
}

export interface PostizPostPayload {
  platforms: SocialPlatform[];
  content: string;
  scheduledAt?: string;
  mediaUrl?: string;
}

export interface PostizPostResponse {
  id: string;
  status?: string;
  scheduledAt?: string;
  publishedAt?: string;
  platforms?: SocialPlatform[];
  content?: string;
  mediaUrl?: string;
}

export interface PostizCommentResponse {
  id: string;
  platform: SocialPlatform;
  postId?: string;
  author?: string;
  body: string;
  createdAt?: string;
}

export interface PostizAnalyticsResponse {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  engagementRate?: number;
  [key: string]: unknown;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function mapStatus(raw: string | undefined): SocialPostStatus {
  switch ((raw ?? "").toLowerCase()) {
    case "published":
    case "sent":
    case "publish":
      return "published";
    case "cancelled":
    case "canceled":
      return "cancelled";
    case "failed":
    case "error":
      return "failed";
    default:
      return "scheduled";
  }
}

/**
 * Thin HTTP wrapper around the self-hosted Postiz REST API.
 *
 * Exposes only the operations the Social plugin and the Paperclip UI need:
 * schedule, publish now, list, cancel, analytics, and comments.
 */
export function createPostizClient(opts: PostizClientOptions) {
  const base = normalizeBaseUrl(opts.baseUrl);
  const fetchImpl = opts.fetchImpl ?? fetch;

  async function request<T>(
    method: "GET" | "POST" | "DELETE" | "PATCH",
    path: string,
    body?: unknown,
    query?: Record<string, string | number | undefined>,
  ): Promise<T> {
    const url = new URL(`${base}${path.startsWith("/") ? path : `/${path}`}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v === undefined) continue;
        url.searchParams.set(k, String(v));
      }
    }

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
      "X-Api-Key": opts.apiKey,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      payload = JSON.stringify(body);
    }

    const res = await fetchImpl(url.toString(), {
      method,
      headers,
      body: payload,
    });

    const text = await res.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!res.ok) {
      const msg = extractErrorMessage(parsed, res.status);
      throw new PostizApiError(msg, res.status, parsed);
    }
    return parsed as T;
  }

  async function schedule(post: PostizPostPayload): Promise<PostizPostResponse> {
    return request<PostizPostResponse>("POST", "/api/v1/posts", {
      integrations: post.platforms,
      content: post.content,
      scheduledAt: post.scheduledAt,
      mediaUrl: post.mediaUrl,
    });
  }

  async function publishNow(post: PostizPostPayload): Promise<PostizPostResponse> {
    return request<PostizPostResponse>("POST", "/api/v1/posts", {
      integrations: post.platforms,
      content: post.content,
      publishNow: true,
      mediaUrl: post.mediaUrl,
    });
  }

  async function list(limit?: number): Promise<PostizPostResponse[]> {
    const payload = await request<
      { posts?: PostizPostResponse[] } | PostizPostResponse[]
    >("GET", "/api/v1/posts", undefined, { limit });
    if (Array.isArray(payload)) return payload;
    return payload.posts ?? [];
  }

  async function cancel(postId: string): Promise<void> {
    await request<void>("DELETE", `/api/v1/posts/${encodeURIComponent(postId)}`);
  }

  async function analytics(postId: string): Promise<SocialPostAnalytics> {
    const raw = await request<PostizAnalyticsResponse>(
      "GET",
      `/api/v1/posts/${encodeURIComponent(postId)}/analytics`,
    );
    return {
      impressions: pickNumber(raw.impressions),
      likes: pickNumber(raw.likes),
      comments: pickNumber(raw.comments),
      shares: pickNumber(raw.shares),
      clicks: pickNumber(raw.clicks),
      engagementRate: pickNumber(raw.engagementRate),
      fetchedAt: new Date().toISOString(),
      raw: raw as Record<string, unknown>,
    };
  }

  async function respondToComment(
    platform: SocialPlatform,
    commentId: string,
    response: string,
  ): Promise<void> {
    await request<void>(
      "POST",
      `/api/v1/comments/${encodeURIComponent(commentId)}/respond`,
      {
        platform,
        response,
      },
    );
  }

  async function recentComments(
    platform: SocialPlatform,
    limit = 20,
  ): Promise<SocialComment[]> {
    const raw = await request<
      { comments?: PostizCommentResponse[] } | PostizCommentResponse[]
    >("GET", "/api/v1/comments", undefined, { platform, limit });
    const rows: PostizCommentResponse[] = Array.isArray(raw) ? raw : raw.comments ?? [];
    return rows.map((row) => ({
      id: row.id,
      platform: row.platform,
      postId: row.postId,
      author: row.author,
      body: row.body,
      createdAt: row.createdAt,
    }));
  }

  return {
    schedule,
    publishNow,
    list,
    cancel,
    analytics,
    respondToComment,
    recentComments,
    request,
    mapStatus,
  };
}

export type PostizClient = ReturnType<typeof createPostizClient>;

function pickNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractErrorMessage(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = typeof record.message === "string" ? record.message : undefined;
    const error = typeof record.error === "string" ? record.error : undefined;
    const detail = message ?? error;
    if (detail) return `Postiz API error (${status}): ${detail}`;
  }
  if (typeof payload === "string" && payload.length > 0) {
    return `Postiz API error (${status}): ${payload}`;
  }
  return `Postiz API error (${status})`;
}
