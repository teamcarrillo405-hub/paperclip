import { useEffect, useRef, useState, useCallback, useMemo } from "react";
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
import { ShieldCheck, AlertCircle, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ApprovalCard } from "../components/ApprovalCard";
import { EmptyState } from "../components/EmptyState";
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
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [isBulkRejecting, setIsBulkRejecting] = useState(false);
  const isBulkOperating = isBulkApproving || isBulkRejecting;
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);
  const isKeyboardNav = useRef(false);
  const [optimisticStatus, setOptimisticStatus] = useState<Record<string, "approved" | "rejected">>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [processingApprovalId, setProcessingApprovalId] = useState<string | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [agentFilter, setAgentFilter] = useState<string>("all");

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

  useEffect(() => {
    if (focusedIndex !== null && isKeyboardNav.current) {
      cardRefs.current[focusedIndex]?.focus();
      isKeyboardNav.current = false;
    }
  }, [focusedIndex]);

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
      setProcessingApprovalId(id);
      setOptimisticStatus((prev) => ({ ...prev, [id]: "approved" }));
    },
    onSuccess: (_approval, id) => {
      setProcessingApprovalId(null);
      setActionError(null);
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
    onError: (err, id) => {
      setProcessingApprovalId(null);
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setActionError(err instanceof Error ? err.message : "Failed to approve");
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onMutate: (id) => {
      setProcessingApprovalId(id);
      setOptimisticStatus((prev) => ({ ...prev, [id]: "rejected" }));
    },
    onSuccess: (_data, id) => {
      setProcessingApprovalId(null);
      setActionError(null);
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err, id) => {
      setProcessingApprovalId(null);
      setOptimisticStatus((prev) => { const next = { ...prev }; delete next[id]; return next; });
      setActionError(err instanceof Error ? err.message : "Failed to reject");
    },
  });

  const requestRevisionMutation = useMutation({
    mutationFn: ({ id, decisionNote }: { id: string; decisionNote: string }) =>
      approvalsApi.requestRevision(id, decisionNote),
    onMutate: ({ id }) => {
      setProcessingApprovalId(id);
    },
    onSuccess: (_data, { id }) => {
      setProcessingApprovalId(null);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
    onError: (err) => {
      setProcessingApprovalId(null);
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

  const agentIdsInApprovals = useMemo(
    () => new Set((data ?? []).map((a) => a.requestedByAgentId).filter(Boolean)),
    [data],
  );

  const agentsInApprovals = useMemo(
    () => (agents ?? []).filter((a) => agentIdsInApprovals.has(a.id)),
    [agents, agentIdsInApprovals],
  );

  const agentFiltered =
    agentFilter === "all"
      ? filtered
      : filtered.filter((a) => a.requestedByAgentId === agentFilter);

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
        isKeyboardNav.current = true;
        setFocusedIndex((prev) => {
          if (filtered.length === 0) return null;
          if (prev === null) return 0;
          return Math.min(prev + 1, filtered.length - 1);
        });
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        isKeyboardNav.current = true;
        setFocusedIndex((prev) => {
          if (filtered.length === 0) return null;
          if (prev === null) return filtered.length - 1;
          return Math.max(prev - 1, 0);
        });
      } else if ((e.key === "a" || e.key === "A") && focusedIndex !== null) {
        const item = filtered[focusedIndex];
        if (item && (item.status === "pending" || item.status === "revision_requested") && !isBulkOperating) {
          e.preventDefault();
          approveMutation.mutate(item.id);
        }
      } else if ((e.key === "r" || e.key === "R") && focusedIndex !== null) {
        const item = filtered[focusedIndex];
        if (item && (item.status === "pending" || item.status === "revision_requested") && !isBulkOperating) {
          e.preventDefault();
          rejectMutation.mutate(item.id);
        }
      }
    },
    [filtered, focusedIndex, approveMutation, rejectMutation, isBulkOperating],
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
    setIsBulkApproving(true);
    setBulkProgress({ done: 0, total: targets.length });
    setActionError(null);
    try {
      for (const item of targets) {
        await approvalsApi.approve(item.id);
        setBulkProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null);
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk approve failed");
    } finally {
      setIsBulkApproving(false);
      setBulkProgress(null);
    }
  }

  async function handleBulkReject() {
    const targets = selectedIds.size > 0
      ? pendingItems.filter((item) => selectedIds.has(item.id))
      : pendingItems;
    setIsBulkRejecting(true);
    setBulkProgress({ done: 0, total: targets.length });
    setActionError(null);
    try {
      for (const item of targets) {
        await approvalsApi.reject(item.id);
        setBulkProgress((prev) => prev ? { ...prev, done: prev.done + 1 } : null);
      }
      setSelectedIds(new Set());
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Bulk reject failed");
    } finally {
      setIsBulkRejecting(false);
      setBulkProgress(null);
    }
  }

  if (!selectedCompanyId) {
    return <div><h1 className="sr-only">Approvals</h1><EmptyState icon={ShieldCheck} message="Select a company to view approvals." /></div>;
  }

  if (isLoading) {
    return <PageSkeleton variant="approvals" title="Approvals" />;
  }

  const allPendingSelected = pendingItems.length > 0 && pendingItems.every((a) => selectedIds.has(a.id));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Approvals</h1>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tabs value={statusFilter} onValueChange={(v) => navigate(`/approvals/${v}`)}>
            <PageTabBar items={[
              { value: "pending", label: <>Pending{pendingCount > 0 && (
                <span className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
                  "bg-yellow-500/20 text-yellow-500"
                )}>
                  {pendingCount}
                </span>
              )}</> },
              { value: "all", label: "All" },
            ]} />
          </Tabs>
          {isConnected ? (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500 animate-pulse" />
              Live
            </span>
          ) : (
            <span role="status" aria-live="polite" className="inline-flex items-center gap-1 rounded-full border border-muted-foreground/20 bg-muted/50 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-foreground/50">
              <span className="h-1.5 w-1.5 rounded-full bg-foreground/30" />
              Offline
            </span>
          )}
          {agentsInApprovals.length > 1 && (
            <select
              value={agentFilter}
              onChange={(e) => setAgentFilter(e.target.value)}
              aria-label="Filter by agent"
              className="h-7 px-2 py-1.5 text-xs border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            >
              <option value="all">All agents</option>
              {agentsInApprovals.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Bulk approve/reject — only on Pending tab */}
        {statusFilter === "pending" && pendingCount > 0 && (
          <div className="flex items-center gap-2">
            {pendingCount > 1 && (
              <button
                type="button"
                aria-label={allPendingSelected ? "Deselect all pending approvals" : "Select all pending approvals"}
                aria-pressed={allPendingSelected}
                onClick={() => toggleSelectAll(pendingItems.map((a) => a.id))}
                className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-foreground/60 border border-border hover:bg-accent/50 transition-colors"
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
              aria-busy={isBulkApproving}
              aria-label={isBulkApproving ? "Approving..." : selectedIds.size > 0 ? `Approve ${selectedIds.size} selected` : "Approve all pending"}
              onClick={handleBulkApprove}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-green-700/40 text-green-700 dark:text-green-400",
                "bg-green-700/5 hover:bg-green-700/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isBulkApproving ? (
                <>
                  <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Working...{bulkProgress ? ` (${bulkProgress.done}/${bulkProgress.total})` : ""}
                </>
              ) : selectedIds.size > 0 ? `Approve (${selectedIds.size})` : "Approve All"}
            </button>
            <button
              type="button"
              disabled={isBulkOperating}
              aria-busy={isBulkRejecting}
              aria-label={isBulkRejecting ? "Rejecting..." : selectedIds.size > 0 ? `Reject ${selectedIds.size} selected` : "Reject all pending"}
              onClick={handleBulkReject}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-destructive/40 text-destructive",
                "bg-destructive/5 hover:bg-destructive/15 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {isBulkRejecting ? (
                <>
                  <LoaderCircle className="h-3 w-3 animate-spin" aria-hidden="true" />
                  Working...{bulkProgress ? ` (${bulkProgress.done}/${bulkProgress.total})` : ""}
                </>
              ) : selectedIds.size > 0 ? `Reject (${selectedIds.size})` : "Reject All"}
            </button>
          </div>
        )}
        {bulkProgress && (
          <span role="status" aria-live="polite" aria-atomic="true" className="sr-only">
            {bulkProgress.done} of {bulkProgress.total} processed
          </span>
        )}
      </div>

      {/* Keyboard shortcut legend — only shown on Pending tab where shortcuts apply and items exist */}
      {statusFilter === "pending" && agentFiltered.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { keys: ["J", "K"], label: "navigate" },
            { keys: ["A"], label: "approve" },
            { keys: ["R"], label: "reject" },
          ].map(({ keys, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-xs text-foreground/60">
              <span className="flex items-center gap-0.5">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1 text-xs font-mono font-semibold text-foreground/70 shadow-sm"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
              <span>{label}</span>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
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
            className="text-destructive/70 hover:text-destructive shrink-0"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {agentFiltered.length === 0 && (
        <div role="status" className="flex flex-col items-center justify-center py-16 text-center">
          <ShieldCheck className="h-8 w-8 text-foreground/40 mb-3" aria-hidden="true" />
          <p className="text-sm text-foreground/60">
            {statusFilter === "pending" ? "No pending approvals." : "No approvals yet."}
          </p>
        </div>
      )}

      {agentFiltered.length > 0 && (
        <div role="feed" aria-label={statusFilter === "all" ? "All approvals" : "Pending approvals"} aria-busy={isBulkOperating} className="grid gap-3">
          <span className="sr-only" aria-live="polite" aria-atomic="true">
            {focusedIndex !== null ? (agentFiltered[focusedIndex]?.type ?? "") : ""}
          </span>
          {statusFilter === "all" ? (() => {
            const pendingGroup = agentFiltered.filter((a) => a.status === "pending" || a.status === "revision_requested");
            const resolvedGroup = agentFiltered.filter((a) => a.status !== "pending" && a.status !== "revision_requested");
            const allItems = [...pendingGroup, ...resolvedGroup];
            return allItems.map((approval, idx) => {
              const isFocused = focusedIndex === idx;
              const isSelected = selectedIds.has(approval.id);
              const isPending = approval.status === "pending" || approval.status === "revision_requested";
              const isFirstResolved = resolvedGroup.length > 0 && approval.id === resolvedGroup[0]?.id;
              return (
                <div key={approval.id}>
                  {isFirstResolved && (
                    <>
                      <div className="border-t border-border my-2" role="separator" aria-label="Resolved approvals below" />
                      <p className="text-xs text-foreground/60 px-1 py-2">Resolved</p>
                    </>
                  )}
                  <div
                    ref={(el) => { cardRefs.current[idx] = el; }}
                    tabIndex={-1}
                    role="article"
                    aria-posinset={idx + 1}
                    aria-setsize={allItems.length}
                    className={cn(
                      "relative rounded-xl transition-all duration-300 focus:outline-none",
                      isFocused && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                      optimisticStatus[approval.id] && "opacity-40 scale-[0.99] pointer-events-none",
                    )}
                    onClick={() => { isKeyboardNav.current = false; setFocusedIndex(idx); }}
                  >
                    {isPending && (
                      <button
                        type="button"
                        aria-label={isSelected ? "Deselect approval" : "Select approval"}
                        onClick={(e) => { e.stopPropagation(); toggleSelect(approval.id); }}
                        className={cn(
                          "absolute top-3 left-3 z-10 flex h-4 w-4 items-center justify-center border rounded-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
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
                      isPending={processingApprovalId === approval.id}
                      pendingAction={
                        processingApprovalId === approval.id
                          ? approveMutation.isPending ? "approve" : rejectMutation.isPending ? "reject" : null
                          : null
                      }
                    />
                  </div>
                </div>
              );
            });
          })() : agentFiltered.map((approval, idx) => {
            const isFocused = focusedIndex === idx;
            const isSelected = selectedIds.has(approval.id);
            const isPending = approval.status === "pending" || approval.status === "revision_requested";
            return (
              <div
                key={approval.id}
                ref={(el) => { cardRefs.current[idx] = el; }}
                tabIndex={-1}
                role="article"
                aria-posinset={idx + 1}
                aria-setsize={agentFiltered.length}
                className={cn(
                  "relative rounded-xl transition-all duration-300 focus:outline-none",
                  isFocused && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                  optimisticStatus[approval.id] && "opacity-40 scale-[0.99] pointer-events-none",
                )}
                onClick={() => { isKeyboardNav.current = false; setFocusedIndex(idx); }}
              >
                {isPending && (
                  <button
                    type="button"
                    aria-label={isSelected ? "Deselect approval" : "Select approval"}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(approval.id); }}
                    className={cn(
                      "absolute top-3 left-3 z-10 flex h-4 w-4 items-center justify-center border rounded-sm transition-colors focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-1",
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
                  isPending={processingApprovalId === approval.id}
                  pendingAction={
                    processingApprovalId === approval.id
                      ? approveMutation.isPending ? "approve" : rejectMutation.isPending ? "reject" : null
                      : null
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
