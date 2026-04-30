import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Download, Image as ImageIcon, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCompany } from "@/context/CompanyContext";
import {
  imageStudioApi,
  type ImageJob,
  type ImageStyle,
  type StyleMeta,
} from "../api/imageStudio";

const FALLBACK_STYLES: StyleMeta[] = [
  { id: "photorealistic", label: "Photorealistic", description: "Realistic photo-quality image." },
  { id: "illustration", label: "Illustration", description: "Modern digital illustration." },
  { id: "logo", label: "Logo", description: "Professional vector-style logo." },
  { id: "social-post", label: "Social Post", description: "Square social media image." },
  { id: "product", label: "Product", description: "Studio product photography." },
  { id: "banner", label: "Banner", description: "Wide marketing banner." },
];

function StatusBadge({ status }: { status: ImageJob["status"] }) {
  if (status === "completed") {
    return <Badge className="gap-1 bg-[#16a34a] hover:bg-[#15803d] text-white text-xs">{status}</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="destructive" className="text-xs">{status}</Badge>;
  }
  return (
    <Badge variant="secondary" className="gap-1 text-xs">
      <Clock className="h-3 w-3 animate-spin" />
      {status}
    </Badge>
  );
}

export function ImageStudioPage() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState<ImageStyle>("photorealistic");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [negativePrompt, setNegativePrompt] = useState("");
  const [latestImageUrl, setLatestImageUrl] = useState<string | null>(null);

  const { data: stylesData } = useQuery({
    queryKey: ["image-studio", "styles"],
    queryFn: () => imageStudioApi.getStyles(),
  });
  const styles = stylesData?.styles ?? FALLBACK_STYLES;
  const provider = stylesData?.provider;

  const { data: jobsResp } = useQuery({
    queryKey: ["image-studio", "jobs", selectedCompanyId],
    queryFn: () => imageStudioApi.listJobs(selectedCompanyId),
    enabled: !!selectedCompanyId,
    refetchInterval: 3000,
  });
  const jobs: ImageJob[] = jobsResp?.jobs ?? [];

  const generateMutation = useMutation({
    mutationFn: () =>
      imageStudioApi.generate({
        companyId: selectedCompanyId ?? undefined,
        prompt,
        style,
        negativePrompt: negativePrompt || undefined,
      }),
    onSuccess: (data) => {
      if (data.imageUrl) setLatestImageUrl(data.imageUrl);
      queryClient.invalidateQueries({
        queryKey: ["image-studio", "jobs", selectedCompanyId],
      });
    },
  });

  const copyUrl = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-2">
        <ImageIcon className="h-7 w-7 text-[#2563eb]" />
        <h1 className="text-2xl font-bold">Image Studio</h1>
        {provider === "comfyui" ? (
          <Badge className="bg-[#16a34a] hover:bg-[#15803d] text-white">ComfyUI</Badge>
        ) : provider === "dalle3" ? (
          <Badge className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white">DALL-E 3</Badge>
        ) : null}
      </div>
      <p className="text-muted-foreground mb-6">
        Generate professional images for your business.
      </p>

      <Card className="mb-6">
        <CardContent className="p-5 space-y-4">
          <div>
            <Label className="mb-2 block">Style</Label>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
              {styles.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setStyle(s.id)}
                  className={`text-xs font-medium px-3 py-2 rounded border transition ${
                    style === s.id
                      ? "bg-[#2563eb] text-white border-[#2563eb]"
                      : "bg-background text-foreground border-border hover:bg-accent"
                  }`}
                  title={s.description}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="prompt" className="mb-2 block">Prompt</Label>
            <Textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you need..."
              rows={4}
            />
          </div>

          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              {showAdvanced ? "Hide advanced" : "Show advanced"}
            </button>
            {showAdvanced && (
              <div className="mt-2">
                <Label htmlFor="negative" className="mb-1 block">Negative prompt</Label>
                <Input
                  id="negative"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="What to avoid..."
                />
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!prompt.trim() || generateMutation.isPending}
              className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white gap-2"
            >
              <Wand2 className="h-4 w-4" />
              {generateMutation.isPending ? "Generating..." : "Generate Image"}
            </Button>
          </div>

          {generateMutation.isPending && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mt-3">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Generating image…</span>
            </div>
          )}

          {generateMutation.isError && (
            <p className="text-sm text-destructive mt-2">
              {generateMutation.error instanceof Error ? generateMutation.error.message : "Generation failed. Please try again."}
            </p>
          )}
        </CardContent>
      </Card>

      {latestImageUrl && (
        <Card className="mb-6">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-5 w-5 text-[#16a34a]" />
              <div className="font-semibold">Latest generation</div>
            </div>
            <img
              src={latestImageUrl}
              alt="Generated"
              className="max-w-full rounded border border-border"
            />
            <div className="flex gap-2 mt-3">
              <a
                href={latestImageUrl}
                target="_blank"
                rel="noreferrer"
                download
                className="inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded bg-[#16a34a] hover:bg-[#15803d] text-white"
              >
                <Download className="h-4 w-4" />
                Download
              </a>
              <Button
                variant="outline"
                size="sm"
                onClick={() => copyUrl(latestImageUrl)}
              >
                Copy URL
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3">Recent Generations</h2>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No images yet. Generate your first one above.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {jobs.map((job) => (
              <Card key={job.id} className="overflow-hidden">
                <CardContent className="p-0">
                  {job.imageUrl ? (
                    <img
                      src={job.imageUrl}
                      alt={job.prompt}
                      className="w-full aspect-square object-cover"
                    />
                  ) : (
                    <div className="w-full aspect-square bg-muted flex items-center justify-center">
                      <Clock className="h-6 w-6 text-muted-foreground animate-spin" />
                    </div>
                  )}
                  <div className="p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium">{job.style}</span>
                      <StatusBadge status={job.status} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate" title={job.prompt}>
                      {job.prompt}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
