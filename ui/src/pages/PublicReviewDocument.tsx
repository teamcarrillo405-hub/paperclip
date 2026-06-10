import { useMemo, type ReactNode } from "react";
import { useParams, useSearchParams } from "@/lib/router";
import { AlertCircle, FileText, Image as ImageIcon } from "lucide-react";

function PublicAttachmentShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-center gap-2 border-b border-border pb-4">
          <FileText className="h-5 w-5 text-muted-foreground" />
          <div>
            <h1 className="text-sm font-semibold">{title}</h1>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}

function MissingId() {
  return (
    <PublicAttachmentShell title="Review attachment unavailable" subtitle="Missing review item">
      <div className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
        <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
        <p className="text-sm text-muted-foreground">This attachment link is missing a review item ID.</p>
      </div>
    </PublicAttachmentShell>
  );
}

export function PublicReviewDocumentPage() {
  const { reviewId } = useParams<{ reviewId?: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const src = useMemo(
    () => reviewId
      ? `/api/public/review/hcc-queue/${encodeURIComponent(reviewId)}/document${token ? `?token=${encodeURIComponent(token)}` : ""}`
      : null,
    [reviewId, token],
  );

  if (!src) return <MissingId />;

  return (
    <PublicAttachmentShell title="HCC review document" subtitle={reviewId ?? ""}>
      <iframe
        title="HCC review document"
        src={src}
        className="min-h-[calc(100vh-120px)] w-full rounded-md border border-border bg-white"
      />
    </PublicAttachmentShell>
  );
}

export function PublicReviewImagePage() {
  const { reviewId } = useParams<{ reviewId?: string }>();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const src = useMemo(
    () => reviewId
      ? `/api/public/review/hcc-queue/${encodeURIComponent(reviewId)}/legacy-image${token ? `?token=${encodeURIComponent(token)}` : ""}`
      : null,
    [reviewId, token],
  );

  if (!src) return <MissingId />;

  return (
    <PublicAttachmentShell title="HCC review image" subtitle={reviewId ?? ""}>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          Attached image
        </div>
        <img src={src} alt="HCC review attachment" className="max-h-[calc(100vh-180px)] w-full object-contain" />
      </div>
    </PublicAttachmentShell>
  );
}
