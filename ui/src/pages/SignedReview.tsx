import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, FileText, Image as ImageIcon, RefreshCw, ShieldCheck } from "lucide-react";
import type { Approval } from "@paperclipai/shared";
import { useParams, useSearchParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "../components/StatusBadge";
import { ApprovalPayloadRenderer, approvalLabel } from "../components/ApprovalPayload";
import { PublicReviewDocumentPage } from "./PublicReviewDocument";
import {
  publicReviewApi,
  type PublicHccQueueReviewItem,
  type PublicReviewResponse,
  type SignedReviewDecision,
} from "../api/publicReview";

function ReviewShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center gap-2 border-b border-border pb-4">
          <ShieldCheck className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">HCC Review</p>
            <p className="text-xs text-muted-foreground">Signed approval link</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
        <div>
          <h1 className="text-base font-semibold">Review link unavailable</h1>
          <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        </div>
      </div>
    </div>
  );
}

function DecisionControls({
  status,
  onDecision,
  pendingDecision,
}: {
  status: string;
  onDecision: (decision: SignedReviewDecision, decisionNote?: string) => void;
  pendingDecision: SignedReviewDecision | null;
}) {
  const [decisionNote, setDecisionNote] = useState("");
  const actionable = status === "pending" || status === "revision_requested";
  const hasDecisionNote = decisionNote.trim().length > 0;

  if (!actionable) {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        This review item is already resolved.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <label className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground" htmlFor="decision-note">
        Decision note
      </label>
      <Textarea
        id="decision-note"
        className="mt-2"
        value={decisionNote}
        onChange={(event) => setDecisionNote(event.target.value)}
        placeholder="Required when rejecting or requesting changes..."
        rows={3}
      />
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          className="bg-green-700 text-white hover:bg-green-600"
          onClick={() => onDecision("approve", decisionNote.trim() || undefined)}
          disabled={!!pendingDecision}
        >
          {pendingDecision === "approve" ? "Approving..." : "Approve"}
        </Button>
        <Button
          variant="outline"
          onClick={() => onDecision("request-revision", decisionNote.trim() || undefined)}
          disabled={!!pendingDecision || !hasDecisionNote}
        >
          {pendingDecision === "request-revision" ? "Requesting..." : "Request changes"}
        </Button>
        <Button
          variant="destructive"
          onClick={() => onDecision("reject", decisionNote.trim() || undefined)}
          disabled={!!pendingDecision || !hasDecisionNote}
        >
          {pendingDecision === "reject" ? "Rejecting..." : "Reject"}
        </Button>
      </div>
    </div>
  );
}

function ApprovalReviewCard({ approval }: { approval: Approval }) {
  const payload = approval.payload as Record<string, unknown>;
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{approvalLabel(approval.type, payload)}</h1>
          <p className="mt-1 font-mono text-xs text-muted-foreground">{approval.id}</p>
        </div>
        <StatusBadge status={approval.status} />
      </div>
      <div className="mt-4">
        <ApprovalPayloadRenderer type={approval.type} payload={payload} />
      </div>
      {approval.decisionNote && (
        <p className="mt-4 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Decision note: {approval.decisionNote}
        </p>
      )}
    </section>
  );
}

function hccPayload(item: PublicHccQueueReviewItem): Record<string, unknown> {
  const seo = item.seoGeoAeo ?? {};
  return {
    title: item.title,
    summary: item.summary ?? item.approvalFocus,
    reviewKind: item.reviewKind,
    contentFamily: item.contentFamily,
    department: item.department,
    nextActionOnApproval: item.nextActionOnApproval,
    fullDocumentUrl: item.documentUrl,
    liveArticleUrl: item.liveArticleUrl,
    hccReviewUrl: item.reviewUrl,
    imageUrl: item.imageUrl,
    approvalChecklist: item.approvalChecklist,
    socialDistributionPlan: item.socialDistributionPlan,
    seoGeoAeoValueSummary: typeof seo.value_summary === "string" ? seo.value_summary : undefined,
    brandVisibilityTargets: Array.isArray(seo.brand_visibility_targets) ? seo.brand_visibility_targets : undefined,
    seoKeywords: Array.isArray(seo.seo_keywords) ? seo.seo_keywords : undefined,
    geoEntities: Array.isArray(seo.geo_entities) ? seo.geo_entities : undefined,
    aeoQuestions: Array.isArray(seo.aeo_questions) ? seo.aeo_questions : undefined,
  };
}

function HccQueueReviewCard({ item, html }: { item: PublicHccQueueReviewItem; html?: string | null }) {
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">{item.title}</h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">{item.id}</p>
          </div>
          <StatusBadge status={item.status} />
        </div>
        <div className="mt-4">
          <ApprovalPayloadRenderer type="request_board_approval" payload={hccPayload(item)} hidePrimaryTitle />
        </div>
        {item.score !== null && (
          <p className="mt-4 inline-flex rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
            Score: {item.score}/100
          </p>
        )}
      </section>

      {item.imageUrl && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            Image
          </div>
          <img src={item.imageUrl} alt={item.title} className="max-h-[560px] w-full rounded-md border border-border object-contain" />
        </section>
      )}

      {html && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-muted-foreground" />
            Full document
          </div>
          <iframe
            title="Review document"
            srcDoc={html}
            sandbox=""
            className="h-[720px] w-full rounded-md border border-border bg-white"
          />
        </section>
      )}
    </div>
  );
}

export function SignedReviewPage() {
  const { kind, reviewId } = useParams<{ kind?: string; reviewId?: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const queryClient = useQueryClient();
  const [pendingDecision, setPendingDecision] = useState<SignedReviewDecision | null>(null);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const reviewKind = kind === "approval" ? "approval" : "hcc_queue";
  const id = reviewId ?? "";

  const queryKey = useMemo(() => ["signed-review", reviewKind, id, token] as const, [reviewKind, id, token]);
  const query = useQuery<PublicReviewResponse>({
    queryKey,
    queryFn: () => reviewKind === "approval"
      ? publicReviewApi.getApproval(id, token)
      : publicReviewApi.getHccQueue(id, token),
    enabled: id.length > 0 && token.length > 0,
    retry: false,
  });

  const mutation = useMutation<PublicReviewResponse, Error, { decision: SignedReviewDecision; decisionNote?: string }>({
    mutationFn: (input: { decision: SignedReviewDecision; decisionNote?: string }) => {
      setPendingDecision(input.decision);
      return reviewKind === "approval"
        ? publicReviewApi.decideApproval(id, token, input.decision, input.decisionNote)
        : publicReviewApi.decideHccQueue(id, token, input.decision, input.decisionNote);
    },
    onSuccess: async () => {
      setDecisionError(null);
      await queryClient.invalidateQueries({ queryKey });
    },
    onError: (error) => {
      setDecisionError(error instanceof Error ? error.message : "Decision failed");
    },
    onSettled: () => setPendingDecision(null),
  });

  if (!id) {
    return (
      <ReviewShell>
        <ErrorPanel message="This page requires a signed review token. Ask Paperclip to generate a new review link." />
      </ReviewShell>
    );
  }

  if (!token && reviewKind === "hcc_queue") {
    return <PublicReviewDocumentPage />;
  }

  if (!token) {
    return (
      <ReviewShell>
        <ErrorPanel message="This page requires a signed review token. Ask Paperclip to generate a new review link." />
      </ReviewShell>
    );
  }

  if (query.isLoading) {
    return (
      <ReviewShell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading review...
        </div>
      </ReviewShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <ReviewShell>
        <ErrorPanel message={query.error instanceof Error ? query.error.message : "The signed review link is invalid or expired."} />
      </ReviewShell>
    );
  }

  const status = query.data.kind === "approval" ? query.data.approval.status : query.data.item.status;

  return (
    <ReviewShell>
      <div className="space-y-4">
        {decisionError && <ErrorPanel message={decisionError} />}
        {mutation.isSuccess && (
          <div className="flex items-start gap-3 rounded-lg border border-green-300 bg-green-50 px-4 py-3 text-green-900 dark:border-green-700/40 dark:bg-green-900/20 dark:text-green-100">
            <CheckCircle2 className="mt-0.5 h-4 w-4" />
            <p className="text-sm">Decision recorded.</p>
          </div>
        )}
        {query.data.kind === "approval"
          ? <ApprovalReviewCard approval={query.data.approval} />
          : <HccQueueReviewCard item={query.data.item} html={query.data.html} />}
        <DecisionControls
          status={status}
          pendingDecision={pendingDecision}
          onDecision={(decision, decisionNote) => mutation.mutate({ decision, decisionNote })}
        />
      </div>
    </ReviewShell>
  );
}
