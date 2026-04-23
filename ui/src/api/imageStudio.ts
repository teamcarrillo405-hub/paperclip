import { api } from "./client";

export type ImageStyle =
  | "photorealistic"
  | "illustration"
  | "logo"
  | "social-post"
  | "product"
  | "banner";

export type ImageJobStatus =
  | "pending"
  | "generating"
  | "completed"
  | "failed";

export type ImageProvider = "dalle3" | "comfyui";

export interface ImageJob {
  id: string;
  companyId: string;
  prompt: string;
  enhancedPrompt?: string | null;
  style: ImageStyle;
  width: number;
  height: number;
  status: ImageJobStatus;
  imageUrl: string | null;
  provider: ImageProvider;
  error?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface GenerateResponse {
  jobId: string;
  status: ImageJobStatus;
  imageUrl: string | null;
  provider: ImageProvider;
}

export interface StyleMeta {
  id: ImageStyle;
  label: string;
  description: string;
}

export interface StylesResponse {
  provider: ImageProvider;
  styles: StyleMeta[];
}

function withCompany(path: string, companyId?: string | null): string {
  if (!companyId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}companyId=${encodeURIComponent(companyId)}`;
}

export const imageStudioApi = {
  generate: (body: {
    companyId?: string;
    prompt: string;
    style?: ImageStyle;
    width?: number;
    height?: number;
    negativePrompt?: string;
  }) => api.post<GenerateResponse>("/images/generate", body),

  listJobs: (companyId?: string | null) =>
    api.get<{ jobs: ImageJob[] }>(withCompany("/images/jobs", companyId)),

  getJob: (jobId: string, companyId?: string | null) =>
    api.get<ImageJob>(withCompany(`/images/jobs/${jobId}`, companyId)),

  getStyles: () => api.get<StylesResponse>("/images/styles"),
};
