import type { Approval } from "@paperclipai/shared";
import { api } from "./client";

export type SignedReviewDecision = "approve" | "reject" | "request-revision";

export type PublicHccQueueReviewItem = {
  kind: "hcc_queue";
  id: string;
  status: string;
  title: string;
  department: string | null;
  contentType: string | null;
  reviewKind: string | null;
  contentFamily: string | null;
  priority: string | null;
  summary: string | null;
  approvalFocus: string | null;
  nextActionOnApproval: string | null;
  liveArticleUrl: string | null;
  score: number | null;
  submittedAt: string | null;
  approvalChecklist: unknown[];
  socialDistributionPlan: unknown[];
  seoGeoAeo: Record<string, unknown> | null;
  hasHtml: boolean;
  hasImage: boolean;
  documentUrl: string | null;
  imageUrl: string | null;
  reviewUrl: string | null;
  paperclipApprovalId: string | null;
};

export type PublicApprovalReviewResponse = {
  kind: "approval";
  approval: Approval;
};

export type PublicHccQueueReviewResponse = {
  kind: "hcc_queue";
  item: PublicHccQueueReviewItem;
  html?: string | null;
  approval?: Approval | null;
};

export type PublicReviewResponse = PublicApprovalReviewResponse | PublicHccQueueReviewResponse;

function withToken(path: string, token: string) {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}token=${encodeURIComponent(token)}`;
}

export const publicReviewApi = {
  getApproval: (id: string, token: string) =>
    api.get<PublicApprovalReviewResponse>(withToken(`/public/review/approval/${encodeURIComponent(id)}`, token)),
  decideApproval: (id: string, token: string, decision: SignedReviewDecision, decisionNote?: string) =>
    api.post<PublicApprovalReviewResponse>(
      withToken(`/public/review/approval/${encodeURIComponent(id)}/${decision}`, token),
      { decisionNote },
    ),
  getHccQueue: (id: string, token: string) =>
    api.get<PublicHccQueueReviewResponse>(withToken(`/public/review/hcc-queue/${encodeURIComponent(id)}`, token)),
  decideHccQueue: (id: string, token: string, decision: SignedReviewDecision, decisionNote?: string) =>
    api.post<PublicHccQueueReviewResponse>(
      withToken(`/public/review/hcc-queue/${encodeURIComponent(id)}/${decision}`, token),
      { decisionNote },
    ),
};
