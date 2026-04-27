import { memo, useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { Issue } from "@paperclipai/shared";
import { heartbeatsApi, type LiveRunForIssue } from "../api/heartbeats";
import type { TranscriptEntry } from "../adapters";
import { costsApi } from "../api/costs";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { cn, relativeTime, formatCents } from "../lib/utils";
import { ExternalLink, StopCircle, RotateCcw, PauseCircle, Maximize2, LayoutGrid } from "lucide-react";
import { Identity } from "./Identity";
import { RunChatSurface } from "./RunChatSurface";
import { useLiveRunTranscripts } from "./transcript/useLiveRunTranscripts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function startOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
}

const MIN_DASHBOARD_RUNS = 4;
const DASHBOARD_RUN_CARD_LIMIT = 4;
const DASHBOARD_LOG_POLL_INTERVAL_MS = 15_000;
const DASHBOARD_LOG_READ_LIMIT_BYTES = 64_000;
const DASHBOARD_MAX_CHUNKS_PER_RUN = 40;
// Fallback polling interval for live-runs when the WebSocket is not connected.
// LiveUpdatesProvider invalidates this query in real time when connected.
const DASHBOARD_LIVE_RUNS_POLL_INTERVAL_MS = 60_000;
const EMPTY_TRANSCRIPT: TranscriptEntry[] = [];

function isRunActive(run: LiveRunForIssue): boolean {
  return run.status === "queued" || run.status === "running";
}

function isRunFailed(run: LiveRunForIssue): boolean {
  return run.status === "error" || run.status === "failed";
}

/**
 * Format elapsed seconds into "Xm Ys" or "Xs" for display.
 */
function formatElapsed(startedAt: string | null, createdAt: string): string {
  const start = startedAt ? new Date(startedAt) : new Date(createdAt);
  const elapsed = Math.max(0, Math.floor((Date.now() - start.getTime()) / 1000));
  if (elapsed < 60) return `${elapsed}s`;
  const mins = Math.floor(elapsed / 60);
  const secs = elapsed % 60;
  return `${mins}m ${secs}s`;
}

interface ActiveAgentsPanelProps {
  companyId: string;
  /** Reflects whether the parent Dashboard has an active WebSocket connection. */
  isLive?: boolean;
}

export function ActiveAgentsPanel({ companyId, isLive = false }: ActiveAgentsPanelProps) {
  const { data: liveRuns } = useQuery({
    queryKey: [...queryKeys.liveRuns(companyId), "dashboard"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId, MIN_DASHBOARD_RUNS),
    refetchInterval: DASHBOARD_LIVE_RUNS_POLL_INTERVAL_MS,
  });

  const mtdFrom = useMemo(() => startOfMonth(), []);
  const { data: costByAgent } = useQuery({
    queryKey: [...queryKeys.costs(companyId, mtdFrom), "by-agent"],
    queryFn: () => costsApi.byAgent(companyId, mtdFrom),
  });

  const costByAgentId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of costByAgent ?? []) map.set(row.agentId, row.costCents);
    return map;
  }, [costByAgent]);

  const runs = liveRuns ?? [];
  const visibleRuns = useMemo(() => runs.slice(0, DASHBOARD_RUN_CARD_LIMIT), [runs]);
  const hiddenRunCount = Math.max(0, runs.length - visibleRuns.length);
  const { data: issues } = useQuery({
    queryKey: [...queryKeys.issues.list(companyId), "with-routine-executions"],
    queryFn: () => issuesApi.list(companyId, { includeRoutineExecutions: true }),
    enabled: visibleRuns.length > 0,
  });

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const issue of issues ?? []) {
      map.set(issue.id, issue);
    }
    return map;
  }, [issues]);

  const { transcriptByRun, hasOutputForRun } = useLiveRunTranscripts({
    runs: visibleRuns,
    companyId,
    maxChunksPerRun: DASHBOARD_MAX_CHUNKS_PER_RUN,
    logPollIntervalMs: DASHBOARD_LOG_POLL_INTERVAL_MS,
    logReadLimitBytes: DASHBOARD_LOG_READ_LIMIT_BYTES,
    enableRealtimeUpdates: false,
  });

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Agents
        </h3>
        {isLive && (
          <span className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-500" />
            </span>
            <span className="text-[10px] text-cyan-600 dark:text-cyan-400 font-medium uppercase tracking-wide">Live</span>
          </span>
        )}
      </div>
      {runs.length === 0 ? (
        <div className="rounded-xl border border-border p-4">
          <p className="text-sm text-muted-foreground">No recent agent runs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          {visibleRuns.map((run) => (
            <AgentRunCard
              key={run.id}
              companyId={companyId}
              run={run}
              issue={run.issueId ? issueById.get(run.issueId) : undefined}
              transcript={transcriptByRun.get(run.id) ?? EMPTY_TRANSCRIPT}
              hasOutput={hasOutputForRun(run.id)}
              isActive={isRunActive(run)}
              mtdCostCents={costByAgentId.get(run.agentId)}
            />
          ))}
        </div>
      )}
      {hiddenRunCount > 0 && (
        <Link
          to="/agents"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-border/50 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent/30 hover:text-foreground"
        >
          <LayoutGrid className="h-3.5 w-3.5" />
          View all running agents
        </Link>
      )}
    </div>
  );
}

const AgentRunCard = memo(function AgentRunCard({
  companyId,
  run,
  issue,
  transcript,
  hasOutput,
  isActive,
  mtdCostCents,
}: {
  companyId: string;
  run: LiveRunForIssue;
  issue?: Issue;
  transcript: TranscriptEntry[];
  hasOutput: boolean;
  isActive: boolean;
  mtdCostCents?: number;
}) {
  const queryClient = useQueryClient();
  const [hovered, setHovered] = useState(false);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const isFailed = isRunFailed(run);

  const cancelMutation = useMutation({
    mutationFn: () => heartbeatsApi.cancel(run.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) });
    },
  });

  const handleCancel = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      cancelMutation.mutate();
    },
    [cancelMutation],
  );

  const pauseMutation = useMutation({
    mutationFn: () => agentsApi.pause(run.agentId, companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) });
    },
  });

  const handlePause = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      pauseMutation.mutate();
    },
    [pauseMutation],
  );

  // Elapsed time — ticks every second while run is active
  const [elapsedLabel, setElapsedLabel] = useState(() =>
    formatElapsed(run.startedAt, run.createdAt),
  );
  useEffect(() => {
    if (!isActive) return;
    setElapsedLabel(formatElapsed(run.startedAt, run.createdAt));
    const id = setInterval(
      () => setElapsedLabel(formatElapsed(run.startedAt, run.createdAt)),
      1_000,
    );
    return () => clearInterval(id);
  }, [isActive, run.startedAt, run.createdAt]);

  return (
    <div
      className={cn(
        "group flex h-[320px] flex-col overflow-hidden rounded-xl border shadow-sm",
        isActive
          ? "border-cyan-500/40 bg-cyan-500/[0.04] shadow-[0_0_0_1px_rgba(6,182,212,0.15),0_8px_32px_rgba(6,182,212,0.12)]"
          : "border-border bg-background/70",
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="border-b border-border/60 px-3 py-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {isActive ? (
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-400 opacity-70" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-cyan-500" />
                </span>
              ) : (
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-muted-foreground/35" />
              )}
              <Identity name={run.agentName} size="sm" className="[&>span:last-child]:!text-[11px]" />
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
              <span>
                {isActive
                  ? `Live now \u00b7 ${elapsedLabel}`
                  : run.finishedAt
                    ? `Finished ${relativeTime(run.finishedAt)}`
                    : `Started ${relativeTime(run.createdAt)}`}
              </span>
              {mtdCostCents != null && mtdCostCents > 0 && (
                <span className="ml-auto font-mono text-[10px] text-muted-foreground/70" title="Agent cost this month">
                  {formatCents(mtdCostCents)} MTD
                </span>
              )}
            </div>
          </div>

          {/* Action controls — always visible when hovered, or when run is failed */}
          <div className={cn("flex items-center gap-0.5 transition-opacity", hovered || isFailed ? "opacity-100" : "opacity-0")}>
            {isFailed && (
              <Link
                to={`/agents/${run.agentId}/runs/${run.id}`}
                title="View run to retry"
                className="inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-accent hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </Link>
            )}
            {isActive && (
              <button
                type="button"
                title="Pause agent"
                disabled={pauseMutation.isPending}
                onClick={handlePause}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors",
                  "hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-500",
                  pauseMutation.isPending && "opacity-50 cursor-not-allowed",
                )}
              >
                <PauseCircle className="h-3.5 w-3.5" />
              </button>
            )}
            {isActive && (
              <button
                type="button"
                title="Cancel run"
                disabled={cancelMutation.isPending}
                onClick={handleCancel}
                className={cn(
                  "inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors",
                  "hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive",
                  cancelMutation.isPending && "opacity-50 cursor-not-allowed",
                )}
              >
                <StopCircle className="h-3.5 w-3.5" />
              </button>
            )}
            <Link
              to={`/agents/${run.agentId}/runs/${run.id}`}
              className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/70 px-2 py-1 text-[10px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </Link>
          </div>
        </div>

        {run.issueId && (
          <div className="mt-3 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2 text-xs">
            <Link
              to={`/issues/${issue?.identifier ?? run.issueId}`}
              className={cn(
                "line-clamp-2 hover:underline",
                isActive ? "text-cyan-700 dark:text-cyan-300" : "text-muted-foreground hover:text-foreground",
              )}
              title={issue?.title ? `${issue?.identifier ?? run.issueId.slice(0, 8)} - ${issue.title}` : issue?.identifier ?? run.issueId.slice(0, 8)}
            >
              {issue?.identifier ?? run.issueId.slice(0, 8)}
              {issue?.title ? ` - ${issue.title}` : ""}
            </Link>
          </div>
        )}
      </div>

      <div className="relative group/transcript min-h-0 flex-1 overflow-y-auto p-3">
        <RunChatSurface
          run={run}
          transcript={transcript}
          hasOutput={hasOutput}
          companyId={companyId}
        />
        <button
          type="button"
          onClick={() => setTranscriptExpanded(true)}
          className="absolute top-2 right-2 opacity-30 group-hover/transcript:opacity-100 transition-opacity p-1 rounded bg-background/80 text-muted-foreground hover:text-foreground"
          title="Expand transcript"
        >
          <Maximize2 className="h-3 w-3" />
        </button>
      </div>

      <Dialog open={transcriptExpanded} onOpenChange={setTranscriptExpanded}>
        <DialogContent className="max-w-3xl h-[70vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              {run.agentName ?? "Agent"} — Live Transcript
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto">
            <RunChatSurface
              run={run}
              transcript={transcript}
              hasOutput={hasOutput}
              companyId={companyId}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});
