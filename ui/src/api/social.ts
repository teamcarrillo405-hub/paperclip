import { api } from "./client";

export type SocialPlatform =
  | "instagram"
  | "linkedin"
  | "x"
  | "reddit"
  | "google_business";

export type SocialPostStatus = "scheduled" | "published" | "failed" | "cancelled";

export interface SocialPost {
  id: string;
  companyId: string;
  postizPostId: string | null;
  platforms: SocialPlatform[];
  content: string;
  status: SocialPostStatus;
  scheduledAt: string | null;
  publishedAt: string | null;
  analytics: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialStats {
  total: number;
  scheduled: number;
  published: number;
  failed: number;
  cancelled: number;
  postsThisMonth: number;
  platformsConnected: number;
  platformBreakdown: Record<string, number>;
}

export interface SocialComment {
  id: string;
  platform: SocialPlatform;
  postId?: string;
  author?: string;
  body: string;
  createdAt?: string;
}

export interface CreateSocialPostInput {
  companyId: string;
  platforms: SocialPlatform[];
  content: string;
  scheduledAt?: string;
  mediaUrl?: string;
  publishNow?: boolean;
}

export const socialApi = {
  listPosts(companyId: string, params?: { limit?: number; status?: SocialPostStatus }) {
    const q = new URLSearchParams({ companyId });
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.status) q.set("status", params.status);
    return api.get<{ posts: SocialPost[] }>(`/social/posts?${q.toString()}`);
  },
  createPost(input: CreateSocialPostInput) {
    return api.post<{ post: SocialPost }>("/social/posts", input);
  },
  cancelPost(companyId: string, id: string) {
    return api.delete<{ post: SocialPost }>(
      `/social/posts/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`,
    );
  },
  stats(companyId: string) {
    return api.get<SocialStats>(`/social/stats?companyId=${encodeURIComponent(companyId)}`);
  },
  comments(companyId: string, params?: { platform?: SocialPlatform; limit?: number }) {
    const q = new URLSearchParams({ companyId });
    if (params?.platform) q.set("platform", params.platform);
    if (params?.limit) q.set("limit", String(params.limit));
    return api.get<{ comments: SocialComment[]; configured: boolean }>(
      `/social/comments?${q.toString()}`,
    );
  },
};
