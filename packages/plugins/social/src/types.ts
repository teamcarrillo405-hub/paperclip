export type SocialPlatform =
  | "instagram"
  | "linkedin"
  | "x"
  | "reddit"
  | "google_business";

export type SocialPostStatus =
  | "scheduled"
  | "published"
  | "failed"
  | "cancelled";

export type SocialContentTone =
  | "professional"
  | "casual"
  | "playful"
  | "authoritative"
  | "enthusiastic"
  | "empathetic";

export interface ScheduledPostInput {
  platforms: SocialPlatform[];
  content: string;
  scheduledAt: string;
  mediaUrl?: string;
}

export interface PublishNowInput {
  platforms: SocialPlatform[];
  content: string;
  mediaUrl?: string;
}

export interface SocialPostSummary {
  id: string;
  postizPostId?: string;
  platforms: SocialPlatform[];
  content: string;
  status: SocialPostStatus;
  scheduledAt?: string;
  publishedAt?: string;
  mediaUrl?: string;
  analytics?: SocialPostAnalytics;
}

export interface SocialPostAnalytics {
  impressions?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  clicks?: number;
  engagementRate?: number;
  fetchedAt?: string;
  raw?: Record<string, unknown>;
}

export interface SocialComment {
  id: string;
  platform: SocialPlatform;
  postId?: string;
  author?: string;
  body: string;
  createdAt?: string;
}

export interface SocialStats {
  scheduled: number;
  published: number;
  failed: number;
  cancelled: number;
  platformBreakdown: Record<string, number>;
}

export interface GeneratedPost {
  platform: SocialPlatform;
  content: string;
  hashtags?: string[];
  warnings?: string[];
}

export interface GeneratePostContentInput {
  topic: string;
  tone: SocialContentTone;
  platforms: SocialPlatform[];
}

export interface GoogleBusinessUpdateInput {
  summary: string;
  callToAction?: {
    label?: string;
    url?: string;
  };
  mediaUrl?: string;
  eventStart?: string;
  eventEnd?: string;
}
