import { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { approvalsApi } from "../api/approvals";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { cn } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { ShieldCheck } from "lucide-react";
import { ApprovalCard } from "../components/ApprovalCard";
import { PageSkeleton } from "../components/PageSkeleton";
import { useCompanyLiveEvents } from "../hooks/useCompanyLiveEvents";

type StatusFilter = "pending" | "all";

export function Approvals() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const pathSegment = location.pathname.split("/").pop() ?? "pending";
  const statusFilter: StatusFilter = pathSegment === "all" ? "all" : "pending";
  const [actionError, setActionError] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isBulkOperating, setIsBulkOperating] = useState(false);

  const { isConnected, lastEvent } = useCompanyLiveEvents(selectedCompanyId ?? undefined);

  useEffect(() => {
    if (!lastEvent || !selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId) });
  }, [lastEvent, queryClient, selectedCompanyId]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Approvals" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!),
    queryFn: () => approvalsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_approval, id) => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  const requestRevisionMutation = useMutation({
    mutationFn: ({ id, decisionNote }: { id: string; decisionNote: string }) =>
      approvalsApi.requestRevision(id, decisionNote),
    onSuccess: () => {
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setActionError(err instanceof Error ? err.message : "Failed to request revision");
    },
  });

  function urgencyScore(a: { status: string; createdAt: Date | string }): number {
    if (a.status !== "pending" && a.status !== "revision_requested") return 0;
    const hrs = (Date.now() - new Date(a.createdAt).getTime()) / 3_600_000;
    if (hrs >= 4) return 3;
    if (hrs >= 1) return 2;
    return 1;
  }

  const filtered = (data ?? [])
    .filter(
      (a) => statusFilter === "all" || a.status === "pending" || a.status === "revision_requested",
    )
    .sort((a, b) => {
      const urgencyDiff = urgencyScore(b) - urgencyScore(a);
      if (urgencyDiff !== 0) return urgencyDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

  const pendingItems = (data ?? []).filter(
    (a) => a.status === "pending" || a.status === "revision_requested",
  );
  const pendingCount = pendingItems.length;

  // J/K keyboard navigation + A/R approve/reject shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Skip if user is typing in an input/textarea
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (filtered.length === 0) return null;
          if (prev === null) return 0;
          return Math.min(prev + 1, filtered.length - 1);
        });
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        setFocusedIndex((prev) => {
          if (filtered.length === 0) return null;
          if (prev === null) return filtered.length - 1;
          return Math.max(prev - 1, 0);
        });
      } else if ((e.key === "a" || e.key === "A") && focusedIndex !== null) {
        const item = filtered[focusedIndex];
        if (item && (item.status === "pending" || item.status === "revision_requested")) {
          e.preventDefault();
          approveMutation.mutate(item.id);
        }
      } else if ((e.key === "r" || e.key === "R") && focusedIndex !== null) {
        const item = filtered[focusedIndex];
        if (item && (item.status === "pending" || item.status === "revision_requested")) {
          e.preventDefault();
          rejectMutation.mutate(item.id);
        }
      }
    },
    [filtered, focusedIndex, approveMutation, rejectMutation],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Reset focused index when filter changes or data reloads
  useEffect(() => {
    setFocusedIndex(null);
  }, [statusFilter]);

  async function handleBulkApprove() {
    setIsBulkOperating(true);
    setActionError(null);
    try {
      for (const item of pendingItems) {
        await approvalsApi.approve(item.id);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk approve failed");
    } finally {
      setIsBulkOperating(false);
    }
  }

  async function handleBulkReject() {
    setIsBulkOperating(true);
    setActionError(null);
    try {
      for (const item of pendingItems) {
        await approvalsApi.reject(item.id);
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk reject failed");
    } finally {
      setIsBulkOperating(false);
    }
  }

  if (!selectedCompanyId) {
    return <p className="text-sm text-muted-foreground">Select a company first.</p>;
  }

  if (isLoading) {
    return <PageSkeleton variant="approvals" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tabs value={statusFilter} onValueChange={(v) => navigate(`/approvals/${v}`)}>
            <PageTabBar items={[
              { value: "pending", label: <>Pending{pendingCount > 0 && (
                <span className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  "bg-yellow-500/20 text-yellow-500"
                )}>
                  {pendingCount}
                </span>
              )}</> },
              { value: "all", label: "All" },
            ]} />
          </Tabs>
          {isConnected && (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
              Live
            </span>
          )}
        </div>

        {/* Bulk approve/reject — only on Pending tab */}
        {statusFilter === "pending" && pendingCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isBulkOperating}
              onClick={handleBulkApprove}
              className={cn(
                "px-3 py-1.5 text-xs font-medium border border-green-700/40 text-green-700 dark:text-green-400",
                "bg-green-700/5 hover:bg-green-700/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isBulkOperating ? "Working..." : "Approve All"}
            </button>
            <button
              type="button"
              disabled={isBulkOperating}
              onClick={handleBulkReject}
              className={cn(
                "px-3 py-1.5 text-xs font-medium border border-destructive/40 text-destructive",
                "bg-destructive/5 hover:bg-destructive/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isBulkOperating ? "Working..." : "Reject All"}
            </button>
          </div>
        )}
      </div>

      {/* Keyboard shortcut legend */}
      <div className="flex items-center gap-3 flex-wrap">
        {[
          { keys: ["J", "K"], label: "navigate" },
          { keys: ["A"], label: "approve" },
          { keys: ["R"], label: "reject" },
        ].map(({ keys, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
            <span className="flex items-center gap-0.5">
              {keys.map((k) => (
                <kbd
                  key={k}
                  className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-mono font-semibold text-foreground/70 shadow-sm"
                >
                  {k}
                </kbd>
              ))}
            </span>
            <span>{label}</span>
          </span>
        ))}
      </div>

      {error && <p className="text-sm text-destructive">{error.message}</p>}
      {actionError && <p className="text-sm text-destructive">{actionError}</p>}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === "pending" ? "No pending approvals." : "No approvals yet."}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((approval, idx) => {
            const isFocused = focusedIndex === idx;
            return (
              <div
                key={approval.id}
                className={cn(
                  "rounded-xl transition-shadow",
                  isFocused && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                )}
                onClick={() => setFocusedIndex(idx)}
              >
                <ApprovalCard
                  approval={approval}
                  requesterAgent={approval.requestedByAgentId ? (agents ?? []).find((a) => a.id === approval.requestedByAgentId) ?? null : null}
                  onApprove={() => approveMutation.mutate(approval.id)}
                  onReject={() => rejectMutation.mutate(approval.id)}
                  onRequestRevision={(decisionNote) => requestRevisionMutation.mutate({ id: approval.id, decisionNote })}
                  detailLink={`/approvals/${approval.id}`}
                  isPending={approveMutation.isPending || rejectMutation.isPending || requestRevisionMutation.isPending || isBulkOperating}
                  pendingAction={
                    approveMutation.isPending ? "approve" : rejectMutation.isPending ? "reject" : null
                  }
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
