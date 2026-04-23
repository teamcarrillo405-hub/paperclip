import { api } from "./client";

export type VideoCompositionId =
  | "WeeklyReport"
  | "SocialPost"
  | "Proposal"
  | "OnboardingDemo";

export type VideoJobStatus =
  | "queued"
  | "rendering"
  | "completed"
  | "failed";

export interface VideoJob {
  id: string;
  companyId: string;
  compositionId: string;
  status: VideoJobStatus;
  outputPath: string | null;
  error: string | null;
  durationMs: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface VideoJobDetail extends VideoJob {
  downloadUrl: string | null;
}

export interface RenderResponse {
  jobId: string;
  status: VideoJobStatus;
}

function withCompany(path: string, companyId?: string | null): string {
  if (!companyId) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}companyId=${encodeURIComponent(companyId)}`;
}

export const videoApi = {
  render: (body: {
    companyId?: string;
    compositionId: VideoCompositionId;
    props: Record<string, unknown>;
  }) => api.post<RenderResponse>("/video/render", body),

  listJobs: (companyId?: string | null) =>
    api.get<{ jobs: VideoJob[] }>(withCompany("/video/jobs", companyId)),

  getJob: (jobId: string, companyId?: string | null) =>
    api.get<VideoJobDetail>(withCompany(`/video/jobs/${jobId}`, companyId)),

  downloadUrl: (jobId: string) => `/api/video/download/${jobId}`,
};
