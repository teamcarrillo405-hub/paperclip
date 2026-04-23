export type WondaPlatform =
  | "twitter"
  | "linkedin"
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube";

export type WondaTone =
  | "professional"
  | "casual"
  | "playful"
  | "bold"
  | "minimal"
  | "inspirational";

export type WondaImageStyle =
  | "photorealistic"
  | "illustration"
  | "3d"
  | "minimalist"
  | "retro"
  | "cinematic";

export type WondaVoiceStyle =
  | "male-warm"
  | "female-warm"
  | "male-energetic"
  | "female-energetic"
  | "narrator"
  | "announcer";

export interface WondaEnv {
  WONDA_API_KEY?: string;
  OPENAI_API_KEY?: string;
  [key: string]: string | undefined;
}

export interface WondaRunOptions {
  cwd?: string;
  env?: WondaEnv;
  timeoutMs?: number;
  signal?: AbortSignal;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
}

export interface WondaRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  output?: unknown;
}

export interface WondaAvailability {
  installed: boolean;
  binaryPath?: string;
  version?: string;
  setupInstructions: string;
}

export interface WondaAssetRef {
  kind: "image" | "video" | "audio" | "text";
  url?: string;
  caption?: string;
  platform?: string;
  mimeType?: string;
  metadata?: Record<string, unknown>;
}

export interface CompetitorAnalysisInput {
  competitorUrls: string[];
}

export interface CompetitorAnalysisResult {
  competitors: Array<{
    url: string;
    brandSummary?: string;
    positioning?: string;
    tone?: string;
    topKeywords?: string[];
  }>;
  opportunities: string[];
  raw?: unknown;
}

export interface GenerateCampaignInput {
  topic: string;
  platforms: WondaPlatform[];
  tone?: WondaTone;
}

export interface GenerateCampaignResult {
  campaignName: string;
  posts: Array<{ platform: WondaPlatform; copy: string; hashtags?: string[] }>;
  assets: WondaAssetRef[];
  raw?: unknown;
}

export interface GenerateProductImageInput {
  description: string;
  style?: WondaImageStyle;
}

export interface GeneratePromoVideoInput {
  script: string;
  voiceStyle?: WondaVoiceStyle;
}

export interface GenerateAudioJingleInput {
  description: string;
}

export interface PostCampaignContentInput {
  campaignId: string;
  platforms: WondaPlatform[];
}

export interface PostCampaignContentResult {
  posted: Array<{ platform: WondaPlatform; url?: string; id?: string }>;
  errors: Array<{ platform: WondaPlatform; message: string }>;
}
