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
import { ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, "approved" | "rejected">>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }

  function toggleSelectAll(ids: string[]) {
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(ids));
  }

  const { isConnected, lastEvent } = useCompanyLiveEvents(selectedCompanyId ?? undefined);

  useEffect(() => {
    if (!lastEvent || !selectedCompanyId) return;
    queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId) });
  }, [lastEvent, queryClient, selectedCompanyId]);

  useEffect(() => {
    setBreadcrumbs([{ label: "Approvals" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
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
    onMutate: (id) => {
      setOptimisticStatus((prev) => ({ ...prev, [id]: "approved" }));
    },
    onSuccess: (_approval, id) => {
      setActionError(null);
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err, id) => {
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onMutate: (id) => {
      setOptimisticStatus((prev) => ({ ...prev, [id]: "rejected" }));
    },
    onSuccess: (_data, id) => {
      setActionError(null);
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err, id) => {
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
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

  useEffect(() => {
    const prev = document.title;
    if (pendingCount > 0) {
      document.title = `(${pendingCount}) Approvals — Avero`;
    } else {
      document.title = "Approvals — Avero";
    }
    return () => { document.title = prev; };
  }, [pendingCount]);

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
    const targets = selectedIds.size > 0
      ? pendingItems.filter((item) => selectedIds.has(item.id))
      : pendingItems;
    setIsBulkOperating(true);
    setActionError(null);
    try {
      for (const item of targets) {
        await approvalsApi.approve(item.id);
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk approve failed");
    } finally {
      setIsBulkOperating(false);
    }
  }

  async function handleBulkReject() {
    const targets = selectedIds.size > 0
      ? pendingItems.filter((item) => selectedIds.has(item.id))
      : pendingItems;
    setIsBulkOperating(true);
    setActionError(null);
    try {
      for (const item of targets) {
        await approvalsApi.reject(item.id);
      }
      setSelectedIds(new Set());
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
          {isConnected ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
              Offline
            </span>
          )}
        </div>

        {/* Bulk approve/reject — only on Pending tab */}
        {statusFilter === "pending" && pendingCount > 0 && (
          <div className="flex items-center gap-2">
            {pendingCount > 1 && (
              <button
                type="button"
                onClick={() => toggleSelectAll(pendingItems.map((a) => a.id))}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground border border-border hover:bg-accent/50 transition-colors"
              >
                <span className={cn(
                  "flex h-3.5 w-3.5 items-center justify-center border border-border rounded-sm",
                  pendingItems.every((a) => selectedIds.has(a.id)) && "bg-foreground border-foreground",
                )}>
                  {pendingItems.every((a) => selectedIds.has(a.id)) && (
                    <svg className="h-2 w-2 text-background" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                All
              </button>
            )}
            <button
              type="button"
              disabled={isBulkOperating}
              onClick={handleBulkApprove}
              className={cn(
                "px-3 py-1.5 text-xs font-medium border border-green-700/40 text-green-700 dark:text-green-400",
                "bg-green-700/5 hover:bg-green-700/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isBulkOperating ? "Working..." : selectedIds.size > 0 ? `Approve (${selectedIds.size})` : "Approve All"}
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
              {isBulkOperating ? "Working..." : selectedIds.size > 0 ? `Reject (${selectedIds.size})` : "Reject All"}
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

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">{error.message || "Failed to load approvals."}</p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            {isRefetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}
      {actionError && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">{actionError}</p>
          </div>
          <button
            type="button"
            onClick={() => setActionError(null)}
            className="text-destructive/70 hover:text-destructive text-xs shrink-0"
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">
            {statusFilter === "pending" ? "No pending approvals." : "No approvals yet."}
          </p>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((approval, idx) => {
            const isFocused = focusedIndex === idx;
            const isSelected = selectedIds.has(approval.id);
            const isPending = approval.status === "pending" || approval.status === "revision_requested";
            return (
              <div
                key={approval.id}
                className={cn(
                  "relative rounded-xl transition-all duration-300",
                  isFocused && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                  optimisticStatus[approval.id] && "opacity-40 scale-[0.99] pointer-events-none",
                )}
                onClick={() => setFocusedIndex(idx)}
              >
                {isPending && (
                  <button
                    type="button"
                    aria-label={isSelected ? "Deselect approval" : "Select approval"}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(approval.id); }}
                    className={cn(
                      "absolute top-3 left-3 z-10 flex h-4 w-4 items-center justify-center border rounded-sm transition-colors",
                      isSelected ? "bg-foreground border-foreground" : "border-border bg-background hover:border-foreground/50",
                    )}
                  >
                    {isSelected && (
                      <svg className="h-2.5 w-2.5 text-background" viewBox="0 0 10 10" fill="none">
                        <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                )}
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
