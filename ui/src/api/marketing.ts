import { api } from "./client";

export type MarketingPlatform =
  | "instagram"
  | "linkedin"
  | "x"
  | "twitter"
  | "reddit"
  | "tiktok"
  | "facebook"
  | "youtube";

export type MarketingTone =
  | "professional"
  | "casual"
  | "exciting"
  | "informative"
  | "playful"
  | "bold";

export type MarketingCampaignStatus =
  | "draft"
  | "generating"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface MarketingCampaignAsset {
  kind: "image" | "video" | "audio" | "text";
  url?: string;
  caption?: string;
  platform?: string;
  mimeType?: string;
  createdAt?: string;
}

export interface MarketingCampaignAssets {
  images?: MarketingCampaignAsset[];
  videos?: MarketingCampaignAsset[];
  audio?: MarketingCampaignAsset[];
  text?: MarketingCampaignAsset[];
  logs?: string[];
}

export interface MarketingCampaign {
  id: string;
  companyId: string;
  name: string;
  topic: string;
  platforms: MarketingPlatform[];
  status: MarketingCampaignStatus;
  assets: MarketingCampaignAssets;
  scheduledAt: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingStatus {
  installed: boolean;
  version?: string;
  binaryPath?: string;
  setupInstructions?: string;
}

export interface CreateCampaignInput {
  companyId: string;
  name: string;
  topic: string;
  platforms: MarketingPlatform[];
  tone?: MarketingTone;
}

export const marketingApi = {
  status() {
    return api.get<MarketingStatus>(`/marketing/status`);
  },
  listCampaigns(companyId: string, params?: { limit?: number; status?: MarketingCampaignStatus }) {
    const q = new URLSearchParams({ companyId });
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.status) q.set("status", params.status);
    return api.get<{ campaigns: MarketingCampaign[] }>(`/marketing/campaigns?${q.toString()}`);
  },
  createCampaign(input: CreateCampaignInput) {
    return api.post<{ campaign: MarketingCampaign }>(`/marketing/campaigns`, input);
  },
  getCampaign(companyId: string, id: string) {
    return api.get<{ campaign: MarketingCampaign }>(
      `/marketing/campaigns/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`,
    );
  },
  publishCampaign(
    companyId: string,
    id: string,
    body: { platforms?: MarketingPlatform[]; scheduledAt?: string } = {},
  ) {
    return api.post<{ campaign: MarketingCampaign }>(
      `/marketing/campaigns/${encodeURIComponent(id)}/publish?companyId=${encodeURIComponent(companyId)}`,
      body,
    );
  },
};
