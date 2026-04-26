import { api } from "./client";

export type DocType =
  | "business-proposal"
  | "status-report"
  | "strategy"
  | "onboarding"
  | "general";

export interface PresentationRequest {
  companyId: string;
  title: string;
  subtitle?: string;
  topic: string;
  slideCount?: number;
  docType: DocType;
  companyName?: string;
  accentColor?: string;
}

export interface PresentationResult {
  id: string;
  title: string;
  filePath: string;
  slideCount: number;
  createdAt: string;
}

export const slidesApi = {
  list(companyId: string) {
    return api.get<{ presentations: PresentationResult[] }>(
      `/slides?companyId=${encodeURIComponent(companyId)}`,
    );
  },

  generate(request: PresentationRequest) {
    return api.post<PresentationResult>("/slides/generate", request);
  },

  downloadUrl(companyId: string, id: string): string {
    return `/api/slides/${encodeURIComponent(id)}/download?companyId=${encodeURIComponent(companyId)}`;
  },

  delete(companyId: string, id: string) {
    return api.delete<void>(
      `/slides/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`,
    );
  },
};
