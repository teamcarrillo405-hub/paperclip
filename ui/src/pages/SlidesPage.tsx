import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Download,
  Loader2,
  Presentation,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { slidesApi, type DocType, type PresentationRequest } from "../api/slides";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { timeAgo } from "../lib/timeAgo";

const DOC_TYPE_LABELS: Record<DocType, string> = {
  "business-proposal": "Business Proposal",
  "status-report": "Status Report",
  strategy: "Strategy",
  onboarding: "Onboarding",
  general: "General",
};

const DOC_TYPES = Object.keys(DOC_TYPE_LABELS) as DocType[];

interface FormState {
  title: string;
  topic: string;
  docType: DocType;
  companyName: string;
  slideCount: number;
}

const DEFAULT_FORM: FormState = {
  title: "",
  topic: "",
  docType: "general",
  companyName: "",
  slideCount: 8,
};

export function SlidesPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>({
    ...DEFAULT_FORM,
    companyName: selectedCompany?.name ?? "",
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Presentation Generator" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (selectedCompany?.name && !form.companyName) {
      setForm((prev) => ({ ...prev, companyName: selectedCompany.name }));
    }
  }, [selectedCompany?.name, form.companyName]);

  const { data, isLoading: slidesQueryIsLoading } = useQuery({
    queryKey: ["slides", selectedCompanyId],
    queryFn: () => slidesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const generateMutation = useMutation({
    mutationFn: (req: PresentationRequest) => slidesApi.generate(req),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["slides", selectedCompanyId] });
      setForm({ ...DEFAULT_FORM, companyName: selectedCompany?.name ?? "" });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to generate presentation");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => slidesApi.delete(selectedCompanyId!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["slides", selectedCompanyId] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete presentation");
    },
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCompanyId) return;
    if (!form.title.trim() || !form.topic.trim()) {
      setError("Title and topic are required");
      return;
    }
    setError(null);
    generateMutation.mutate({
      companyId: selectedCompanyId,
      title: form.title.trim(),
      topic: form.topic.trim(),
      docType: form.docType,
      companyName: form.companyName.trim() || undefined,
      slideCount: form.slideCount,
    });
  }

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={Presentation}
        message="Select a company to generate presentations."
      />
    );
  }

  if (slidesQueryIsLoading) return <PageSkeleton variant="list" title="Presentations" />;

  const presentations = data?.presentations ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Presentation className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Presentation Generator</h1>
      </div>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {error}
        </p>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left panel: generation form */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">
            New Presentation
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="slides-title">Presentation Title</Label>
              <Input
                id="slides-title"
                placeholder="e.g. Q3 Strategy Review"
                value={form.title}
                onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                disabled={generateMutation.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slides-topic">Topic / Subject</Label>
              <Input
                id="slides-topic"
                placeholder="e.g. AI automation for field operations"
                value={form.topic}
                onChange={(e) => setForm((prev) => ({ ...prev, topic: e.target.value }))}
                disabled={generateMutation.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slides-doctype">Document Type</Label>
              <select
                id="slides-doctype"
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                value={form.docType}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, docType: e.target.value as DocType }))
                }
                disabled={generateMutation.isPending}
              >
                {DOC_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {DOC_TYPE_LABELS[dt]}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slides-company">Company Name (optional)</Label>
              <Input
                id="slides-company"
                placeholder="e.g. Acme Corp"
                value={form.companyName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, companyName: e.target.value }))
                }
                disabled={generateMutation.isPending}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slides-count">Slide Count</Label>
              <Input
                id="slides-count"
                type="number"
                min={5}
                max={20}
                value={form.slideCount}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    slideCount: Math.max(5, Math.min(20, Number(e.target.value))),
                  }))
                }
                disabled={generateMutation.isPending}
              />
              <p className="text-xs text-muted-foreground">Between 5 and 20 slides</p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={generateMutation.isPending}
            >
              {generateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating…
                </>
              ) : (
                <>
                  <Presentation className="mr-2 h-4 w-4" />
                  Generate Presentation
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Right panel: past presentations */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Past Presentations
          </h2>

          {presentations.length === 0 ? (
            <div className="rounded-lg border border-border p-8 text-center">
              <Presentation className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No presentations yet</p>
              <p className="text-xs text-muted-foreground mt-1">
                Generate your first presentation using the form.
              </p>
            </div>
          ) : (
            <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
              {presentations.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-accent/40 transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{p.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.slideCount} slides &middot; {timeAgo(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <a
                      href={slidesApi.downloadUrl(selectedCompanyId!, p.id)}
                      download
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      onClick={() => {
                        if (confirm("Delete this presentation?")) {
                          deleteMutation.mutate(p.id);
                        }
                      }}
                      disabled={deleteMutation.isPending}
                      className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
