import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Instagram,
  Linkedin,
  MapPin,
  MessageSquare,
  Plus,
  Share2,
  Sparkles,
  Twitter,
  X as XIcon,
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
import { PageSkeleton } from "@/components/PageSkeleton";
import {
  socialApi,
  type CreateSocialPostInput,
  type SocialComment,
  type SocialPlatform,
  type SocialPost,
  type SocialPostStatus,
  type SocialStats,
} from "@/api/social";

const PLATFORMS: { value: SocialPlatform; label: string; icon: typeof Instagram }[] = [
  { value: "instagram", label: "Instagram", icon: Instagram },
  { value: "linkedin", label: "LinkedIn", icon: Linkedin },
  { value: "x", label: "X (Twitter)", icon: Twitter },
  { value: "reddit", label: "Reddit", icon: MessageSquare },
  { value: "google_business", label: "Google Business", icon: MapPin },
];

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const match = PLATFORMS.find((p) => p.value === platform);
  const Icon = match?.icon ?? Share2;
  return <Icon className={cn("h-4 w-4", className)} />;
}

function StatusBadge({ status }: { status: SocialPostStatus }) {
  const tone =
    status === "published"
      ? "bg-green-600 text-white"
      : status === "scheduled"
      ? "bg-blue-600 text-white"
      : status === "failed"
      ? "bg-red-600 text-white"
      : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", tone)}>
      {status}
    </Badge>
  );
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function SocialMediaPage() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Social Media" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const postsQuery = useQuery<{ posts: SocialPost[] }>({
    queryKey: ["social", "posts", selectedCompanyId ?? ""],
    queryFn: () => socialApi.listPosts(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const statsQuery = useQuery<SocialStats>({
    queryKey: ["social", "stats", selectedCompanyId ?? ""],
    queryFn: () => socialApi.stats(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });
  const commentsQuery = useQuery<{ comments: SocialComment[]; configured: boolean }>({
    queryKey: ["social", "comments", selectedCompanyId ?? ""],
    queryFn: () => socialApi.comments(selectedCompanyId!, { limit: 20 }),
    enabled: !!selectedCompanyId,
  });

  const posts = postsQuery.data?.posts ?? [];
  const stats = statsQuery.data;
  const comments = commentsQuery.data?.comments ?? [];

  const [composeOpen, setComposeOpen] = useState(false);
  const [content, setContent] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(["instagram"]);
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1, 0, 0, 0);
    return toLocalInputValue(d);
  });
  const [topic, setTopic] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  const togglePlatform = (p: SocialPlatform) => {
    setSelectedPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateSocialPostInput) => socialApi.createPost(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social", "posts", selectedCompanyId ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["social", "stats", selectedCompanyId ?? ""] });
      setContent("");
      setComposeOpen(false);
      pushToast({ title: "Post created", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to create post", body: err.message, tone: "error" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => socialApi.cancelPost(selectedCompanyId!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["social", "posts", selectedCompanyId ?? ""] });
      queryClient.invalidateQueries({ queryKey: ["social", "stats", selectedCompanyId ?? ""] });
      pushToast({ title: "Post cancelled", tone: "info" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to cancel post", body: err.message, tone: "error" });
    },
  });

  function handleSchedule() {
    if (!selectedCompanyId || content.trim().length === 0 || selectedPlatforms.length === 0) return;
    const iso = new Date(scheduledAt).toISOString();
    createMutation.mutate({
      companyId: selectedCompanyId,
      platforms: selectedPlatforms,
      content,
      scheduledAt: iso,
    });
  }

  function handlePostNow() {
    if (!selectedCompanyId || content.trim().length === 0 || selectedPlatforms.length === 0) return;
    createMutation.mutate({
      companyId: selectedCompanyId,
      platforms: selectedPlatforms,
      content,
      publishNow: true,
    });
  }

  async function handleAiGenerate() {
    if (!topic.trim() || selectedPlatforms.length === 0) {
      pushToast({ title: "Enter a topic and pick at least one platform", tone: "info" });
      return;
    }
    setAiLoading(true);
    try {
      // Content generation is available through agent tooling; for the UI we
      // scaffold a useful draft locally so the feature is usable before Postiz
      // is wired end-to-end. The agent-side tool remains the source of truth.
      const platformNames = selectedPlatforms.map((p) => p.replace("_", " ")).join(", ");
      setContent(
        `${topic}\n\nTailored for: ${platformNames}.\n\nEdit this draft or ask an agent to generate platform-specific copy with the social_generate_post_content tool.`,
      );
    } finally {
      setAiLoading(false);
    }
  }

  const upcoming = useMemo(
    () =>
      posts.filter((p) => p.status === "scheduled" || p.status === "published").slice(0, 50),
    [posts],
  );

  if (!selectedCompany || !selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  if (postsQuery.isLoading) return <PageSkeleton variant="list" title="Social Media" />;

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Share2 className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Social Media</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Schedule and publish posts to Instagram, LinkedIn, X, Reddit & Google Business.
        </p>
      </div>

      {/* Analytics summary row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Posts this month</div>
            <div className="mt-1 text-2xl font-semibold">{stats?.postsThisMonth ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Scheduled</div>
            <div className="mt-1 text-2xl font-semibold">{stats?.scheduled ?? "—"}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase text-muted-foreground">Platforms in use</div>
            <div className="mt-1 text-2xl font-semibold">{stats?.platformsConnected ?? "—"}</div>
          </CardContent>
        </Card>
      </div>

      {/* Compose */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="font-medium">Content calendar</div>
            <Button size="sm" onClick={() => setComposeOpen((o) => !o)}>
              <Plus className="mr-1 h-4 w-4" /> {composeOpen ? "Close" : "Create Post"}
            </Button>
          </div>

          {composeOpen && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                <div>
                  <Label htmlFor="social-topic">Topic (for AI generate)</Label>
                  <Input
                    id="social-topic"
                    placeholder="e.g. Grand opening next Saturday"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                  />
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={aiLoading}
                    onClick={handleAiGenerate}
                  >
                    <Sparkles className="mr-1 h-4 w-4" />
                    {aiLoading ? "Generating…" : "AI Generate"}
                  </Button>
                </div>
              </div>

              <div>
                <Label htmlFor="social-content">Content</Label>
                <Textarea
                  id="social-content"
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's happening with your business?"
                />
              </div>

              <div>
                <Label>Platforms</Label>
                <div className="mt-2 flex flex-wrap gap-3">
                  {PLATFORMS.map(({ value, label, icon: Icon }) => {
                    const checked = selectedPlatforms.includes(value);
                    return (
                      <label
                        key={value}
                        className={cn(
                          "flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm cursor-pointer",
                          checked && "border-primary bg-accent/30",
                        )}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePlatform(value)}
                        />
                        <Icon className="h-4 w-4" /> {label}
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <Label htmlFor="social-scheduled-at">Schedule for</Label>
                <Input
                  id="social-scheduled-at"
                  type="datetime-local"
                  value={scheduledAt}
                  onChange={(e) => setScheduledAt(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={handleSchedule}
                  disabled={
                    createMutation.isPending ||
                    content.trim().length === 0 ||
                    selectedPlatforms.length === 0
                  }
                >
                  {createMutation.isPending ? "Saving…" : "Schedule"}
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePostNow}
                  disabled={
                    createMutation.isPending ||
                    content.trim().length === 0 ||
                    selectedPlatforms.length === 0
                  }
                >
                  Post Now
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Content calendar list */}
      <Card>
        <CardContent className="p-0">
          {upcoming.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">
              No posts yet. Click <span className="font-medium">Create Post</span> to schedule your first one.
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {upcoming.map((post) => (
                <li key={post.id} className="flex items-start gap-3 p-4">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    {post.platforms.map((p) => (
                      <PlatformIcon key={p} platform={p} className="text-muted-foreground" />
                    ))}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={post.status} />
                      <span className="text-xs text-muted-foreground">
                        {post.status === "published"
                          ? `Published ${formatDateTime(post.publishedAt)}`
                          : `Scheduled ${formatDateTime(post.scheduledAt)}`}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm">{post.content}</p>
                  </div>
                  {post.status === "scheduled" && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={cancelMutation.isPending}
                      onClick={() => cancelMutation.mutate(post.id)}
                    >
                      Cancel
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Comments queue */}
      <div>
        <div className="mb-2 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-medium">Comments queue</h2>
        </div>
        <Card>
          <CardContent className="p-0">
            {commentsQuery.data?.configured === false ? (
              <div className="p-6 text-sm text-muted-foreground">
                Comments will appear here once Postiz is configured.
              </div>
            ) : comments.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">
                No recent comments.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {comments.map((c) => (
                  <li key={`${c.platform}:${c.id}`} className="flex items-start gap-3 p-4">
                    <PlatformIcon platform={c.platform} className="mt-1 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">{c.author ?? "Anonymous"}</span>
                        <span>·</span>
                        <span>{formatDateTime(c.createdAt)}</span>
                      </div>
                      <p className="mt-1 text-sm">{c.body}</p>
                    </div>
                    <Button size="sm" variant="outline" disabled>
                      Reply
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SocialMediaPage;

// X-icon import kept for potential future use; suppress unused warning.
void XIcon;
