import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  Download,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Megaphone,
  Plus,
  Video as VideoIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToastActions } from "@/context/ToastContext";
import { cn } from "@/lib/utils";
import {
  marketingApi,
  type CreateCampaignInput,
  type MarketingCampaign,
  type MarketingCampaignAsset,
  type MarketingCampaignStatus,
  type MarketingPlatform,
  type MarketingStatus,
  type MarketingTone,
} from "@/api/marketing";

const PLATFORM_META: Record<MarketingPlatform, { label: string; emoji: string }> = {
  instagram: { label: "Instagram", emoji: "📸" },
  linkedin: { label: "LinkedIn", emoji: "💼" },
  x: { label: "X", emoji: "✖️" },
  twitter: { label: "Twitter", emoji: "🐦" },
  reddit: { label: "Reddit", emoji: "👽" },
  tiktok: { label: "TikTok", emoji: "🎵" },
  facebook: { label: "Facebook", emoji: "📘" },
  youtube: { label: "YouTube", emoji: "▶️" },
};

const UI_PLATFORMS: MarketingPlatform[] = [
  "instagram",
  "linkedin",
  "x",
  "reddit",
  "tiktok",
];

const UI_TONES: { value: MarketingTone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "casual", label: "Casual" },
  { value: "exciting", label: "Exciting" },
  { value: "informative", label: "Informative" },
];

function PlatformChip({ platform }: { platform: MarketingPlatform }) {
  const meta = PLATFORM_META[platform] ?? { label: platform, emoji: "🏷️" };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs"
      title={meta.label}
    >
      <span aria-hidden>{meta.emoji}</span>
      <span className="sr-only">{meta.label}</span>
    </span>
  );
}

function StatusBadge({ status }: { status: MarketingCampaignStatus }) {
  const tone =
    status === "published"
      ? "bg-green-600 text-white"
      : status === "publishing"
      ? "bg-amber-600 text-white"
      : status === "scheduled"
      ? "bg-blue-600 text-white"
      : status === "ready"
      ? "bg-emerald-600 text-white"
      : status === "generating"
      ? "bg-indigo-600 text-white"
      : status === "failed"
      ? "bg-red-600 text-white"
      : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", tone)}>
      {status}
    </Badge>
  );
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString();
  } catch {
    return value;
  }
}

function flattenAssets(campaign: MarketingCampaign): MarketingCampaignAsset[] {
  const { images = [], videos = [], audio = [], text = [] } = campaign.assets ?? {};
  return [...images, ...videos, ...audio, ...text];
}

function SetupBanner({ status }: { status: MarketingStatus }) {
  const [copied, setCopied] = useState(false);
  const cmd = "npm install -g @degausai/wonda";
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  };
  return (
    <Card className="border-amber-500 bg-amber-50 dark:bg-amber-950/30">
      <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium">Install Wonda CLI to unlock AI-powered marketing</div>
          <div className="text-sm text-muted-foreground">
            Run the command below on the server host, then reload this page.
          </div>
          {status.setupInstructions ? (
            <pre className="mt-2 max-h-40 overflow-auto rounded bg-background/60 p-2 text-xs text-muted-foreground">
              {status.setupInstructions}
            </pre>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded bg-background px-2 py-1 text-sm">{cmd}</code>
          <Button size="sm" variant="outline" onClick={onCopy}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span className="ml-1">{copied ? "Copied" : "Copy"}</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function AssetIcon({ kind }: { kind: MarketingCampaignAsset["kind"] }) {
  if (kind === "image") return <ImageIcon className="h-4 w-4" />;
  if (kind === "video") return <VideoIcon className="h-4 w-4" />;
  if (kind === "audio") return <FileAudio className="h-4 w-4" />;
  return <FileText className="h-4 w-4" />;
}

function AssetGallery({ assets }: { assets: MarketingCampaignAsset[] }) {
  if (assets.length === 0) {
    return (
      <div className="rounded border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No assets yet — generation may still be in progress.
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
      {assets.map((asset, idx) => (
        <Card key={`${asset.url ?? "asset"}-${idx}`} className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1 capitalize">
                <AssetIcon kind={asset.kind} />
                {asset.kind}
              </span>
              {asset.url ? (
                <a
                  href={asset.url}
                  download
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  <Download className="h-3.5 w-3.5" /> Download
                </a>
              ) : null}
            </div>
            {asset.kind === "image" && asset.url ? (
              <img
                src={asset.url}
                alt={asset.caption ?? "asset"}
                className="mt-2 h-32 w-full rounded object-cover"
              />
            ) : asset.kind === "video" && asset.url ? (
              <video
                src={asset.url}
                controls
                className="mt-2 h-32 w-full rounded bg-black"
              />
            ) : asset.kind === "audio" && asset.url ? (
              <audio src={asset.url} controls className="mt-2 w-full" />
            ) : null}
            {asset.caption ? (
              <div className="mt-2 line-clamp-2 text-xs">{asset.caption}</div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MarketingPage() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{
    name: string;
    topic: string;
    platforms: MarketingPlatform[];
    tone: MarketingTone;
  }>({ name: "", topic: "", platforms: ["instagram"], tone: "professional" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Marketing Studio" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const statusQuery = useQuery<MarketingStatus>({
    queryKey: ["marketing", "status"],
    queryFn: () => marketingApi.status(),
  });

  const campaignsQuery = useQuery<{ campaigns: MarketingCampaign[] }>({
    queryKey: ["marketing", "campaigns", selectedCompanyId ?? ""],
    queryFn: () => marketingApi.listCampaigns(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const campaigns = campaignsQuery.data?.campaigns ?? [];
  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedId) ?? null,
    [campaigns, selectedId],
  );

  const createMutation = useMutation({
    mutationFn: (input: CreateCampaignInput) => marketingApi.createCampaign(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing", "campaigns"] });
      pushToast({ title: "Campaign created", tone: "success" });
      setCreating(false);
      setForm({ name: "", topic: "", platforms: ["instagram"], tone: "professional" });
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Failed to create campaign",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const publishMutation = useMutation({
    mutationFn: (campaignId: string) =>
      marketingApi.publishCampaign(selectedCompanyId!, campaignId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing", "campaigns"] });
      pushToast({ title: "Publishing started", tone: "success" });
    },
    onError: (err: unknown) => {
      pushToast({
        title: "Failed to publish",
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  const togglePlatform = (p: MarketingPlatform) => {
    setForm((prev) => ({
      ...prev,
      platforms: prev.platforms.includes(p)
        ? prev.platforms.filter((x) => x !== p)
        : [...prev.platforms, p],
    }));
  };

  const onSubmit = () => {
    if (!selectedCompanyId) return;
    if (!form.name.trim() || !form.topic.trim() || form.platforms.length === 0) {
      pushToast({ title: "Fill in all required fields", tone: "error" });
      return;
    }
    createMutation.mutate({
      companyId: selectedCompanyId,
      name: form.name.trim(),
      topic: form.topic.trim(),
      platforms: form.platforms,
      tone: form.tone,
    });
  };

  const wondaReady = statusQuery.data?.installed === true;

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <Megaphone className="h-6 w-6 text-primary" />
          <div>
            <h1 className="text-xl font-semibold">Marketing Studio</h1>
            <div className="text-sm text-muted-foreground">
              Generate campaigns, images, videos, and audio with the Wonda CLI.
            </div>
          </div>
        </div>
        <Button onClick={() => setCreating(true)} disabled={!selectedCompanyId}>
          <Plus className="mr-1 h-4 w-4" /> Create Campaign
        </Button>
      </div>

      {statusQuery.data && !wondaReady ? <SetupBanner status={statusQuery.data} /> : null}

      {creating ? (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4">
            <div className="text-base font-medium">New campaign</div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="campaign-name">Campaign name</Label>
                <Input
                  id="campaign-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Spring launch"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="campaign-tone">Tone</Label>
                <select
                  id="campaign-tone"
                  value={form.tone}
                  onChange={(e) =>
                    setForm({ ...form, tone: e.target.value as MarketingTone })
                  }
                  className="rounded border border-input bg-background px-2 py-1.5 text-sm"
                >
                  {UI_TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="campaign-topic">Topic / what to promote</Label>
              <Textarea
                id="campaign-topic"
                value={form.topic}
                onChange={(e) => setForm({ ...form, topic: e.target.value })}
                placeholder="Describe the product, offer, or story…"
                rows={3}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Platforms</Label>
              <div className="flex flex-wrap gap-3">
                {UI_PLATFORMS.map((p) => {
                  const meta = PLATFORM_META[p];
                  return (
                    <label key={p} className="inline-flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={form.platforms.includes(p)}
                        onCheckedChange={() => togglePlatform(p)}
                      />
                      <span>
                        {meta.emoji} {meta.label}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={createMutation.isPending}>
                {createMutation.isPending ? "Generating…" : "Generate Campaign"}
              </Button>
            </div>
            {createMutation.isError && (
              <p className="text-sm text-destructive mt-2">
                {createMutation.error instanceof Error ? createMutation.error.message : "Failed to create campaign. Please try again."}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {selectedCampaign ? (
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-lg font-semibold">{selectedCampaign.name}</div>
                <div className="text-sm text-muted-foreground">{selectedCampaign.topic}</div>
                <div className="mt-1 flex items-center gap-2">
                  <StatusBadge status={selectedCampaign.status} />
                  <span className="text-xs text-muted-foreground">
                    Created {formatDate(selectedCampaign.createdAt)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" onClick={() => setSelectedId(null)}>
                  Close
                </Button>
                <Button
                  onClick={() => publishMutation.mutate(selectedCampaign.id)}
                  disabled={
                    publishMutation.isPending ||
                    (selectedCampaign.status !== "ready" &&
                      selectedCampaign.status !== "draft" &&
                      selectedCampaign.status !== "scheduled")
                  }
                >
                  {publishMutation.isPending ? "Publishing…" : "Publish to Social"}
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {selectedCampaign.platforms.map((p) => (
                <PlatformChip key={p} platform={p} />
              ))}
            </div>
            <AssetGallery assets={flattenAssets(selectedCampaign)} />
          </CardContent>
        </Card>
      ) : null}

      <div>
        <div className="mb-2 text-sm font-medium text-muted-foreground">Campaigns</div>
        {campaignsQuery.isLoading ? (
          <div className="p-6 text-center text-muted-foreground">Loading…</div>
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No campaigns yet. Click <strong>Create Campaign</strong> to get started.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {campaigns.map((c) => {
              const assetCount = flattenAssets(c).length;
              return (
                <Card
                  key={c.id}
                  className={cn(
                    "cursor-pointer transition hover:border-primary",
                    selectedId === c.id && "border-primary",
                  )}
                  onClick={() => setSelectedId(c.id)}
                >
                  <CardContent className="flex flex-col gap-2 p-4">
                    <div className="flex items-center justify-between">
                      <div className="font-medium">{c.name}</div>
                      <StatusBadge status={c.status} />
                    </div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{c.topic}</div>
                    <div className="flex flex-wrap gap-1">
                      {c.platforms.map((p) => (
                        <PlatformChip key={p} platform={p} />
                      ))}
                    </div>
                    <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
                      <span>{formatDate(c.createdAt)}</span>
                      <span>
                        {assetCount} {assetCount === 1 ? "asset" : "assets"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
