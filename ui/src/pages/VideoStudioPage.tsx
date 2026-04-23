import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart2,
  CheckCircle,
  Clock,
  Download,
  FileText,
  Play,
  Share2,
  Video,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/context/CompanyContext";
import {
  videoApi,
  type VideoCompositionId,
  type VideoJob,
  type VideoJobStatus,
} from "../api/video";

interface CompositionMeta {
  id: VideoCompositionId;
  title: string;
  description: string;
  durationSeconds: number;
  icon: typeof BarChart2;
}

const COMPOSITIONS: CompositionMeta[] = [
  {
    id: "WeeklyReport",
    title: "Weekly Report Video",
    description:
      "Animated summary of the week: revenue, customers, and a headline metric.",
    durationSeconds: 5,
    icon: BarChart2,
  },
  {
    id: "SocialPost",
    title: "Social Post Video",
    description: "Short square video for Instagram, TikTok, or LinkedIn feeds.",
    durationSeconds: 3,
    icon: Share2,
  },
  {
    id: "Proposal",
    title: "Proposal Video",
    description: "Title card + three key points + a pricing slide for pitch decks.",
    durationSeconds: 10,
    icon: FileText,
  },
  {
    id: "OnboardingDemo",
    title: "Onboarding Demo",
    description: "Welcome customers with a short feature walkthrough.",
    durationSeconds: 6,
    icon: Play,
  },
];

function statusTone(status: VideoJobStatus): "default" | "success" | "warning" | "danger" {
  if (status === "completed") return "success";
  if (status === "failed") return "danger";
  if (status === "rendering") return "warning";
  return "default";
}

function StatusBadge({ status }: { status: VideoJobStatus }) {
  const tone = statusTone(status);
  const icon =
    status === "completed" ? (
      <CheckCircle className="h-3 w-3" />
    ) : status === "rendering" ? (
      <Clock className="h-3 w-3 animate-spin" />
    ) : (
      <Clock className="h-3 w-3" />
    );
  return (
    <Badge
      variant={tone === "success" ? "default" : "secondary"}
      className="gap-1 text-xs"
    >
      {icon}
      {status}
    </Badge>
  );
}

interface FormState {
  [key: string]: string;
}

function defaultPropsFor(id: VideoCompositionId, companyName: string): FormState {
  switch (id) {
    case "WeeklyReport":
      return {
        companyName,
        revenue: "48250",
        customers: "127",
        topMetric: "Customer retention up 12%",
        weekOf: new Date().toISOString().slice(0, 10),
      };
    case "SocialPost":
      return {
        headline: "Big news",
        subtext: "Something great just launched.",
        ctaText: "Learn more",
        brandColor: "#2563eb",
      };
    case "Proposal":
      return {
        companyName,
        proposalTitle: "Growth partnership",
        keyPoints: "Custom AI agents\n24/7 automated monitoring\nDedicated success team",
        price: "12500",
      };
    case "OnboardingDemo":
      return {
        companyName,
        features: "Connect your tools\nAutomate routine work\nGet weekly reports",
      };
  }
}

function serializeProps(
  id: VideoCompositionId,
  state: FormState,
): Record<string, unknown> {
  switch (id) {
    case "WeeklyReport":
      return {
        companyName: state.companyName,
        revenue: Number(state.revenue) || 0,
        customers: Number(state.customers) || 0,
        topMetric: state.topMetric,
        weekOf: state.weekOf,
      };
    case "SocialPost":
      return {
        headline: state.headline,
        subtext: state.subtext,
        ctaText: state.ctaText,
        brandColor: state.brandColor || "#2563eb",
      };
    case "Proposal":
      return {
        companyName: state.companyName,
        proposalTitle: state.proposalTitle,
        keyPoints: (state.keyPoints || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        price: Number(state.price) || 0,
      };
    case "OnboardingDemo":
      return {
        companyName: state.companyName,
        features: (state.features || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
      };
  }
}

export function VideoStudioPage() {
  const { selectedCompanyId, selectedCompany } = useCompany();
  const queryClient = useQueryClient();
  const [activeComposition, setActiveComposition] =
    useState<VideoCompositionId | null>(null);
  const [formState, setFormState] = useState<FormState>({});

  const { data: jobsResp } = useQuery({
    queryKey: ["video", "jobs", selectedCompanyId],
    queryFn: () => videoApi.listJobs(selectedCompanyId),
    enabled: !!selectedCompanyId,
    refetchInterval: 3000,
  });
  const jobs: VideoJob[] = jobsResp?.jobs ?? [];

  const renderMutation = useMutation({
    mutationFn: (input: {
      compositionId: VideoCompositionId;
      props: Record<string, unknown>;
    }) =>
      videoApi.render({
        companyId: selectedCompanyId ?? undefined,
        compositionId: input.compositionId,
        props: input.props,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["video", "jobs", selectedCompanyId],
      });
      setActiveComposition(null);
    },
  });

  const openComposition = (id: VideoCompositionId) => {
    setActiveComposition(id);
    setFormState(defaultPropsFor(id, selectedCompany?.name ?? "Your Company"));
  };

  const submit = () => {
    if (!activeComposition) return;
    renderMutation.mutate({
      compositionId: activeComposition,
      props: serializeProps(activeComposition, formState),
    });
  };

  const activeMeta = useMemo(
    () => COMPOSITIONS.find((c) => c.id === activeComposition) ?? null,
    [activeComposition],
  );

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <Video className="h-7 w-7 text-[#2563eb]" />
        <h1 className="text-2xl font-bold">Video Studio</h1>
      </div>
      <p className="text-muted-foreground mb-6">
        Create professional videos for your business.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {COMPOSITIONS.map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.id} className="hover:shadow-md transition">
              <CardContent className="p-5">
                <div className="flex items-start gap-4">
                  <div className="p-3 rounded-lg bg-[#2563eb]/10 text-[#2563eb] shrink-0">
                    <Icon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {c.description}
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      ~{c.durationSeconds}s
                    </div>
                    <Button
                      size="sm"
                      className="mt-4 bg-[#2563eb] hover:bg-[#1d4ed8]"
                      onClick={() => openComposition(c.id)}
                    >
                      Create Video
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {activeMeta && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget && !renderMutation.isPending) {
              setActiveComposition(null);
            }
          }}
        >
          <Card className="w-full max-w-lg">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <activeMeta.icon className="h-5 w-5 text-[#2563eb]" />
                <div className="font-semibold">{activeMeta.title}</div>
              </div>
              <CompositionForm
                compositionId={activeMeta.id}
                state={formState}
                onChange={setFormState}
              />
              <div className="flex justify-end gap-2 pt-3">
                <Button
                  variant="ghost"
                  onClick={() => setActiveComposition(null)}
                  disabled={renderMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={submit}
                  disabled={renderMutation.isPending}
                  className="bg-[#16a34a] hover:bg-[#15803d]"
                >
                  {renderMutation.isPending ? "Rendering..." : "Render Video"}
                </Button>
              </div>
              {renderMutation.isError && (
                <div className="text-xs text-destructive">
                  {(renderMutation.error as Error)?.message ?? "Render failed"}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Render Queue</h2>
        {jobs.length === 0 ? (
          <div className="text-sm text-muted-foreground border border-dashed rounded-lg p-8 text-center">
            No renders yet. Pick a composition above to get started.
          </div>
        ) : (
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Composition</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium text-right">Download</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t">
                    <td className="px-3 py-2">{job.compositionId}</td>
                    <td className="px-3 py-2">
                      <StatusBadge status={job.status} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {job.status === "completed" ? (
                        <a
                          href={videoApi.downloadUrl(job.id)}
                          className="inline-flex items-center gap-1 text-[#2563eb] hover:underline"
                        >
                          <Download className="h-4 w-4" />
                          MP4
                        </a>
                      ) : job.status === "failed" ? (
                        <span className="text-destructive text-xs">
                          {job.error ?? "failed"}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function CompositionForm({
  compositionId,
  state,
  onChange,
}: {
  compositionId: VideoCompositionId;
  state: FormState;
  onChange: (next: FormState) => void;
}) {
  const set = (key: string, value: string) =>
    onChange({ ...state, [key]: value });

  if (compositionId === "WeeklyReport") {
    return (
      <div className="space-y-3">
        <Field label="Company Name">
          <Input value={state.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Revenue ($)">
            <Input type="number" value={state.revenue ?? ""} onChange={(e) => set("revenue", e.target.value)} />
          </Field>
          <Field label="Customers">
            <Input type="number" value={state.customers ?? ""} onChange={(e) => set("customers", e.target.value)} />
          </Field>
        </div>
        <Field label="Top Metric">
          <Input value={state.topMetric ?? ""} onChange={(e) => set("topMetric", e.target.value)} />
        </Field>
        <Field label="Week Of">
          <Input value={state.weekOf ?? ""} onChange={(e) => set("weekOf", e.target.value)} />
        </Field>
      </div>
    );
  }
  if (compositionId === "SocialPost") {
    return (
      <div className="space-y-3">
        <Field label="Headline">
          <Input value={state.headline ?? ""} onChange={(e) => set("headline", e.target.value)} />
        </Field>
        <Field label="Subtext">
          <Input value={state.subtext ?? ""} onChange={(e) => set("subtext", e.target.value)} />
        </Field>
        <Field label="CTA Text">
          <Input value={state.ctaText ?? ""} onChange={(e) => set("ctaText", e.target.value)} />
        </Field>
        <Field label="Brand Color">
          <Input value={state.brandColor ?? "#2563eb"} onChange={(e) => set("brandColor", e.target.value)} />
        </Field>
      </div>
    );
  }
  if (compositionId === "Proposal") {
    return (
      <div className="space-y-3">
        <Field label="Company Name">
          <Input value={state.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
        </Field>
        <Field label="Proposal Title">
          <Input value={state.proposalTitle ?? ""} onChange={(e) => set("proposalTitle", e.target.value)} />
        </Field>
        <Field label="Key Points (one per line, up to 3)">
          <Textarea rows={3} value={state.keyPoints ?? ""} onChange={(e) => set("keyPoints", e.target.value)} />
        </Field>
        <Field label="Price ($)">
          <Input type="number" value={state.price ?? ""} onChange={(e) => set("price", e.target.value)} />
        </Field>
      </div>
    );
  }
  // OnboardingDemo
  return (
    <div className="space-y-3">
      <Field label="Company Name">
        <Input value={state.companyName ?? ""} onChange={(e) => set("companyName", e.target.value)} />
      </Field>
      <Field label="Features (one per line, up to 5)">
        <Textarea rows={5} value={state.features ?? ""} onChange={(e) => set("features", e.target.value)} />
      </Field>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

export default VideoStudioPage;
