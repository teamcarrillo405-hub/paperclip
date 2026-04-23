import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  Bot,
  Play,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { crewsApi, type CrewSummary, type CrewRun } from "@/api/crews";

const BRAND_PRIMARY = "#2563eb";
const BRAND_ACCENT = "#16a34a";

function StatusBadge({ status }: { status: CrewRun["status"] }) {
  const map: Record<CrewRun["status"], { label: string; cls: string; Icon: typeof CheckCircle }> = {
    pending: { label: "Pending", cls: "bg-muted text-muted-foreground", Icon: Clock },
    running: { label: "Running", cls: "bg-amber-500 text-white", Icon: Loader2 },
    succeeded: { label: "Completed", cls: "bg-green-600 text-white", Icon: CheckCircle },
    failed: { label: "Failed", cls: "bg-red-600 text-white", Icon: XCircle },
    cancelled: { label: "Cancelled", cls: "bg-muted text-muted-foreground", Icon: XCircle },
  };
  const { label, cls, Icon } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      <Icon className={`h-3 w-3 ${status === "running" ? "animate-spin" : ""}`} />
      {label}
    </span>
  );
}

function CrewCard({
  crew,
  onDeploy,
}: {
  crew: CrewSummary;
  onDeploy: (crew: CrewSummary) => void;
}) {
  return (
    <Card className="flex flex-col">
      <CardContent className="flex flex-1 flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white"
            style={{ backgroundColor: BRAND_PRIMARY }}
          >
            <Users className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold capitalize">{crew.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{crew.description}</p>
          </div>
        </div>
        <div className="flex-1">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Agents
          </div>
          <ul className="space-y-1.5">
            {crew.agents.map((agent) => (
              <li
                key={agent.role}
                className="flex items-start gap-2 text-sm"
              >
                <Bot className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted-foreground" />
                <span>{agent.role}</span>
              </li>
            ))}
          </ul>
        </div>
        <Button
          onClick={() => onDeploy(crew)}
          className="w-full gap-2"
          style={{ backgroundColor: BRAND_PRIMARY, color: "white" }}
        >
          <Play className="h-4 w-4" />
          Deploy Crew
        </Button>
      </CardContent>
    </Card>
  );
}

function DeployModal({
  crew,
  onClose,
}: {
  crew: CrewSummary;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  const [runId, setRunId] = useState<string | null>(null);

  const runMutation = useMutation({
    mutationFn: () => crewsApi.run(crew.id, input),
    onSuccess: (data) => {
      setRunId(data.runId);
      queryClient.invalidateQueries({ queryKey: ["crews", "runs"] });
    },
  });

  const runQuery = useQuery({
    queryKey: ["crews", "run", runId],
    queryFn: () => (runId ? crewsApi.getRun(runId) : Promise.resolve(null)),
    enabled: !!runId,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === "running" || data.status === "pending")) return 2000;
      return false;
    },
  });

  const run = runQuery.data;
  const isRunning =
    runMutation.isPending ||
    (!!run && (run.status === "running" || run.status === "pending"));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg text-white"
              style={{ backgroundColor: BRAND_PRIMARY }}
            >
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold capitalize">Deploy {crew.name} Crew</h2>
              <p className="text-xs text-muted-foreground">{crew.goal}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 overflow-auto px-6 py-5">
          {!run ? (
            <div className="space-y-3">
              <label className="block text-sm font-medium">Describe what you need</label>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                rows={6}
                placeholder={`e.g., ${crew.tasks[0]?.description ?? "Tell the crew what you need..."}`}
                disabled={isRunning}
              />
              {runMutation.error ? (
                <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                  {(runMutation.error as Error).message}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Run Status</span>
                <StatusBadge status={run.status} />
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-4">
                {isRunning ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Crew is working...
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm">
                    {run.output ?? "(no output)"}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-3">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {!run ? (
            <Button
              onClick={() => runMutation.mutate()}
              disabled={!input.trim() || isRunning}
              className="gap-2"
              style={{ backgroundColor: BRAND_ACCENT, color: "white" }}
            >
              {isRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4" />
              )}
              Launch Crew
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function RecentRuns() {
  const { data: runs, isLoading } = useQuery({
    queryKey: ["crews", "runs"],
    queryFn: () => crewsApi.listRuns(10),
    refetchInterval: 5000,
  });

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Recent Runs</h2>
      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : !runs || runs.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No crew runs yet. Deploy a crew above to get started.
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border">
          {runs.map((run) => (
            <div
              key={run.id}
              className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/30"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{run.crewName}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(run.createdAt).toLocaleString()}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {typeof run.inputs?.input === "string"
                    ? run.inputs.input
                    : JSON.stringify(run.inputs)}
                </div>
              </div>
              <StatusBadge status={run.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CrewsPage() {
  const [selectedCrew, setSelectedCrew] = useState<CrewSummary | null>(null);

  const { data: crews, isLoading, error } = useQuery({
    queryKey: ["crews", "list"],
    queryFn: () => crewsApi.list(),
  });

  const sortedCrews = useMemo(() => {
    if (!crews) return [];
    const order = ["marketing", "operations", "sales", "finance"];
    return [...crews].sort(
      (a, b) =>
        order.indexOf(a.id.toLowerCase()) - order.indexOf(b.id.toLowerCase()),
    );
  }, [crews]);

  useEffect(() => {
    if (!selectedCrew) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedCrew(null);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedCrew]);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6">
      <header className="flex items-center gap-4">
        <div
          className="flex h-12 w-12 items-center justify-center rounded-xl text-white"
          style={{ backgroundColor: BRAND_PRIMARY }}
        >
          <Users className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">AI Crews</h1>
          <p className="text-sm text-muted-foreground">
            Deploy specialized multi-agent teams for complex tasks
          </p>
        </div>
      </header>

      {error ? (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">
          {(error as Error).message}
        </div>
      ) : null}

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading crews...</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {sortedCrews.map((crew) => (
            <CrewCard key={crew.id} crew={crew} onDeploy={setSelectedCrew} />
          ))}
        </div>
      )}

      <Badge className="hidden" />

      <RecentRuns />

      {selectedCrew ? (
        <DeployModal crew={selectedCrew} onClose={() => setSelectedCrew(null)} />
      ) : null}
    </div>
  );
}

export default CrewsPage;
