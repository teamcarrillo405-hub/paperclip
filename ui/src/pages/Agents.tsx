import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { Link, useNavigate, useLocation } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { agentsApi, type OrgNode } from "../api/agents";
import { costsApi } from "../api/costs";
import { heartbeatsApi } from "../api/heartbeats";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useSidebar } from "../context/SidebarContext";
import { useToast } from "../context/ToastContext";
import { queryKeys } from "../lib/queryKeys";
import { StatusBadge } from "../components/StatusBadge";
import { agentStatusDot, agentStatusDotDefault } from "../lib/status-colors";
import { EntityRow } from "../components/EntityRow";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { relativeTime, cn, agentRouteRef, agentUrl, formatCents } from "../lib/utils";
import { PageTabBar } from "../components/PageTabBar";
import { Tabs } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Bot, Plus, List, GitBranch, SlidersHorizontal, Search, ChevronUp, Download, AlertCircle, LoaderCircle } from "lucide-react";
import { AGENT_ROLE_LABELS, type Agent } from "@paperclipai/shared";

import { getAdapterLabel } from "../adapters/adapter-display-registry";

const roleLabels = AGENT_ROLE_LABELS as Record<string, string>;

type SortCol = "name" | "status" | "lastActive" | "cost";
type SortDir = "asc" | "desc";

type FilterTab = "all" | "active" | "paused" | "error";

function matchesFilter(status: string, tab: FilterTab, showTerminated: boolean): boolean {
  if (status === "terminated") return showTerminated;
  if (tab === "all") return true;
  if (tab === "active") return status === "active" || status === "running" || status === "idle";
  if (tab === "paused") return status === "paused";
  if (tab === "error") return status === "error";
  return true;
}

function filterAgents(agents: Agent[], tab: FilterTab, showTerminated: boolean): Agent[] {
  return agents
    .filter((a) => matchesFilter(a.status, tab, showTerminated))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function filterOrgTree(nodes: OrgNode[], tab: FilterTab, showTerminated: boolean): OrgNode[] {
  return nodes
    .reduce<OrgNode[]>((acc, node) => {
      const filteredReports = filterOrgTree(node.reports, tab, showTerminated);
      if (matchesFilter(node.status, tab, showTerminated) || filteredReports.length > 0) {
        acc.push({ ...node, reports: filteredReports });
      }
      return acc;
    }, [])
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function Agents() {
  const { selectedCompanyId } = useCompany();
  const queryClient = useQueryClient();
  const { openNewAgent } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const { isMobile } = useSidebar();
  const pathSegment = location.pathname.split("/").pop() ?? "all";
  const tab: FilterTab = (pathSegment === "all" || pathSegment === "active" || pathSegment === "paused" || pathSegment === "error") ? pathSegment : "all";
  const [view, setView] = useState<"list" | "org">("org");
  const forceListView = isMobile;
  const effectiveView: "list" | "org" = forceListView ? "list" : view;
  const [showTerminated, setShowTerminated] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterDropdownRef = useRef<HTMLDivElement>(null);
  const filterTriggerRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sort, setSort] = useState<{ col: SortCol; dir: SortDir } | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const { data: agents, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: orgTree, isLoading: isOrgLoading, isError: isOrgError, error: orgError, refetch: refetchOrg } = useQuery({
    queryKey: queryKeys.org(selectedCompanyId!),
    queryFn: () => agentsApi.org(selectedCompanyId!),
    enabled: !!selectedCompanyId && effectiveView === "org",
  });

  const { data: runs } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId!), "agents-page"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 15_000,
  });

  const mtdFrom = useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  }, []);

  const { data: costByAgentData } = useQuery({
    queryKey: [...queryKeys.costs(selectedCompanyId!, mtdFrom), "by-agent"],
    queryFn: () => costsApi.byAgent(selectedCompanyId!, mtdFrom),
    enabled: !!selectedCompanyId,
  });

  const costByAgentId = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of costByAgentData ?? []) map.set(row.agentId, row.costCents);
    return map;
  }, [costByAgentData]);

  const pauseMutation = useMutation({
    mutationFn: (id: string) => agentsApi.pause(id, selectedCompanyId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to pause agent", body: err.message, tone: "error" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => agentsApi.remove(id, selectedCompanyId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to delete agent", body: err.message, tone: "error" });
    },
  });

  const liveRunByAgent = useMemo(() => {
    const map = new Map<string, { runId: string; liveCount: number }>();
    for (const r of runs ?? []) {
      if (r.status !== "running" && r.status !== "queued") continue;
      const existing = map.get(r.agentId);
      if (existing) {
        existing.liveCount += 1;
        continue;
      }
      map.set(r.agentId, { runId: r.id, liveCount: 1 });
    }
    return map;
  }, [runs]);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const handleSort = useCallback((col: SortCol) => {
    setSort((prev) =>
      prev?.col === col
        ? prev.dir === "asc" ? { col, dir: "desc" as SortDir } : null
        : { col, dir: "asc" as SortDir }
    );
  }, []);

  useEffect(() => {
    setBreadcrumbs([{ label: "Agents" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    if (!filtersOpen) return;
    function handleMouseDown(e: MouseEvent) {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [filtersOpen]);

  if (!selectedCompanyId) {
    return <EmptyState icon={Bot} message="Select a company to view agents." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const filtered = filterAgents(agents ?? [], tab, showTerminated);
  const filteredOrg = filterOrgTree(orgTree ?? [], tab, showTerminated);

  const searchTrimmed = search.trim().toLowerCase();
  const searchFiltered = searchTrimmed
    ? filtered.filter((a) =>
        a.name.toLowerCase().includes(searchTrimmed) ||
        (a.role ?? "").toLowerCase().includes(searchTrimmed) ||
        (a.adapterType ?? "").toLowerCase().includes(searchTrimmed) ||
        (a.status ?? "").toLowerCase().includes(searchTrimmed)
      )
    : filtered;

  const sortedAgents = sort
    ? [...searchFiltered].sort((a, b) => {
        const dir = sort.dir === "asc" ? 1 : -1;
        if (sort.col === "name") return a.name.localeCompare(b.name) * dir;
        if (sort.col === "status") return (a.status ?? "").localeCompare(b.status ?? "") * dir;
        if (sort.col === "lastActive") {
          const ta = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).getTime() : 0;
          const tb = b.lastHeartbeatAt ? new Date(b.lastHeartbeatAt).getTime() : 0;
          return (ta - tb) * dir;
        }
        if (sort.col === "cost") {
          return ((costByAgentId.get(a.id) ?? 0) - (costByAgentId.get(b.id) ?? 0)) * dir;
        }
        return 0;
      })
    : searchFiltered;

  const allVisibleIds = sortedAgents.map((a) => a.id);
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id) => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allVisibleIds));
    }
  }

  async function handleBulkPause() {
    try {
      await Promise.all([...selectedIds].map((id) => pauseMutation.mutateAsync(id)));
    } finally {
      setSelectedIds(new Set());
    }
  }

  async function handleBulkDelete() {
    try {
      await Promise.all([...selectedIds].map((id) => deleteMutation.mutateAsync(id)));
    } finally {
      setSelectedIds(new Set());
      setConfirmDeleteOpen(false);
    }
  }

  function handleExportCsv() {
    const rows = [
      ["Name", "Role", "Status", "Adapter", "MTD Cost ($)", "Last Active"].join(","),
      ...sortedAgents
        .filter((a) => selectedIds.has(a.id))
        .map((a) =>
          [
            JSON.stringify(a.name),
            JSON.stringify(roleLabels[a.role] ?? a.role ?? ""),
            a.status ?? "",
            a.adapterType ?? "",
            ((costByAgentId.get(a.id) ?? 0) / 100).toFixed(2),
            a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).toISOString() : "",
          ].join(",")
        ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "agents.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-4">
      <h1 className="sr-only">Agents</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => navigate(`/agents/${v}`)}>
          <PageTabBar
            items={[
              { value: "all", label: "All" },
              { value: "active", label: "Active" },
              { value: "paused", label: "Paused" },
              { value: "error", label: "Error" },
            ]}
            value={tab}
            onValueChange={(v) => navigate(`/agents/${v}`)}
          />
        </Tabs>
        <div className="flex items-center gap-2">
          <div className="relative flex items-center">
            <Search className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              aria-label="Search agents"
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                "h-7 w-44 rounded-none border border-border bg-background pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground",
                "focus:outline-none focus:ring-1 focus:ring-ring focus:border-ring transition-colors",
              )}
            />
          </div>
          <div className="relative" ref={filterDropdownRef}>
            <button
              ref={filterTriggerRef}
              id="filter-menu-trigger"
              aria-expanded={filtersOpen}
              aria-haspopup="menu"
              className={cn(
                "flex items-center gap-1.5 px-2 py-1.5 text-xs transition-colors border border-border",
                filtersOpen || showTerminated ? "text-foreground bg-accent" : "text-muted-foreground hover:bg-accent/50"
              )}
              onClick={() => {
                const opening = !filtersOpen;
                setFiltersOpen(opening);
                if (opening) {
                  setTimeout(() => firstMenuItemRef.current?.focus(), 50);
                }
              }}
            >
              <SlidersHorizontal className="h-3 w-3" aria-hidden="true" />
              Filters
              {showTerminated && <span className="ml-0.5 px-1 bg-foreground/10 rounded text-[10px]">1</span>}
            </button>
            {filtersOpen && (
              <div
                role="menu"
                aria-labelledby="filter-menu-trigger"
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setFiltersOpen(false);
                    filterTriggerRef.current?.focus();
                  } else if (e.key === "Tab") {
                    setFiltersOpen(false);
                    filterTriggerRef.current?.focus();
                  } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                    e.preventDefault();
                    firstMenuItemRef.current?.focus();
                  }
                }}
                className="absolute right-0 top-full mt-1 z-50 w-48 border border-border bg-popover shadow-md p-1"
              >
                <button
                  ref={firstMenuItemRef}
                  role="menuitemcheckbox"
                  aria-checked={showTerminated}
                  className="flex items-center gap-2 w-full px-2 py-1.5 text-xs text-left hover:bg-accent/50 transition-colors"
                  onClick={() => setShowTerminated(!showTerminated)}
                >
                  <span className={cn(
                    "flex items-center justify-center h-3.5 w-3.5 border border-border rounded-sm",
                    showTerminated && "bg-foreground"
                  )} aria-hidden="true">
                    {showTerminated && <span className="text-background text-[10px] leading-none">&#10003;</span>}
                  </span>
                  Show terminated
                </button>
              </div>
            )}
          </div>
          {!forceListView && (
            <div className="flex items-center border border-border">
              <button
                aria-label="List view"
                aria-pressed={effectiveView === "list"}
                className={cn(
                  "p-1.5 transition-colors",
                  effectiveView === "list" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                )}
                onClick={() => setView("list")}
              >
                <List className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              <button
                aria-label="Org chart view"
                aria-pressed={effectiveView === "org"}
                className={cn(
                  "p-1.5 transition-colors",
                  effectiveView === "org" ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent/50"
                )}
                onClick={() => setView("org")}
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
          <Button size="sm" variant="outline" onClick={openNewAgent}>
            <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
            New Agent
          </Button>
        </div>
      </div>

      {agents !== undefined && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { label: "Total Agents", value: String(agents.length) },
            {
              label: "Active Now",
              value: String(
                new Set(
                  (runs ?? [])
                    .filter((r) => r.status === "running" || r.status === "queued")
                    .map((r) => r.agentId),
                ).size,
              ),
            },
            {
              label: "Cost MTD",
              value: (() => {
                const total = [...costByAgentId.values()].reduce((s, c) => s + c, 0);
                return total > 0 ? formatCents(total) : "—";
              })(),
            },
            {
              label: "Live Runs",
              value: String((runs ?? []).filter((r) => r.status === "running" || r.status === "queued").length),
            },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="rounded-md border border-border/60 bg-card px-3 py-2 shadow-sm"
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {label}
              </p>
              <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value}</p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">{error.message || "Failed to load agents."}</p>
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

      {agents && agents.length === 0 && (
        <EmptyState
          icon={Bot}
          message="Create your first agent to get started."
          action="New Agent"
          onAction={openNewAgent}
        />
      )}

      {effectiveView === "list" && sortedAgents.length > 0 && (
        <div role="grid" aria-label="Agents list" className="border border-border">
          <div role="rowgroup">
          <div role="row" className="flex items-center gap-3 border-b border-border/60 px-3 py-1.5 bg-muted/20">
            <button
              type="button"
              role="checkbox"
              aria-checked={allSelected ? true : someSelected ? ("mixed" as const) : false}
              aria-label="Select all agents"
              onClick={toggleSelectAll}
              className={cn(
                "flex h-4 w-4 shrink-0 items-center justify-center border border-border rounded-sm transition-colors",
                allSelected ? "bg-foreground border-foreground" : "hover:border-foreground/50",
              )}
            >
              {allSelected && (
                <svg className="h-2.5 w-2.5 text-background" viewBox="0 0 10 10" fill="none">
                  <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              {!allSelected && someSelected && allVisibleIds.some((id) => selectedIds.has(id)) && (
                <span className="h-1.5 w-1.5 rounded-sm bg-foreground/60" />
              )}
            </button>
            <div role="columnheader" className="flex-1"><SortHeader col="name" label="Name" sort={sort} onSort={handleSort} className="flex-1" /></div>
            <div className="hidden sm:flex items-center gap-3">
              <div role="columnheader"><SortHeader col="cost" label="MTD Cost" sort={sort} onSort={handleSort} className="w-20 justify-end" /></div>
              <span role="columnheader" className="w-28 text-right text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Adapter</span>
              <div role="columnheader"><SortHeader col="lastActive" label="Last Active" sort={sort} onSort={handleSort} className="w-16 justify-end" /></div>
              <div role="columnheader"><SortHeader col="status" label="Status" sort={sort} onSort={handleSort} className="w-20 justify-end" /></div>
            </div>
          </div>
          </div>
          <div role="rowgroup">
          {sortedAgents.map((agent) => {
            const isSelected = selectedIds.has(agent.id);
            return (
              <div role="row" key={agent.id} className="flex items-center hover:bg-accent/30 transition-colors">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selectedIds.has(agent.id)}
                  aria-label={`Select ${agent.name}`}
                  onClick={() => toggleSelect(agent.id)}
                  className="ml-3 flex h-4 w-4 shrink-0 items-center justify-center border border-border rounded-sm transition-colors hover:border-foreground/50"
                >
                  {isSelected && (
                    <svg className="h-2.5 w-2.5 text-foreground" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
                <div role="cell" className="flex-1 min-w-0">
                  <EntityRow
                    title={agent.name}
                    subtitle={`${roleLabels[agent.role] ?? agent.role}${agent.title ? ` - ${agent.title}` : ""}`}
                    to={agentUrl(agent)}
                    className={agent.pausedAt && tab !== "paused" ? "opacity-50" : ""}
                    leading={
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        {(agent.status === "active" || agent.status === "running") && (
                          <span
                            className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${agentStatusDot[agent.status] ?? agentStatusDotDefault}`}
                          />
                        )}
                        <span
                          className={`relative inline-flex h-2.5 w-2.5 rounded-full ${agentStatusDot[agent.status] ?? agentStatusDotDefault}`}
                        />
                      </span>
                    }
                    trailing={
                      <div className="flex items-center gap-3">
                        <span className="sm:hidden flex items-center gap-2">
                          {liveRunByAgent.has(agent.id) ? (
                            <LiveRunIndicator
                              agentRef={agentRouteRef(agent)}
                              runId={liveRunByAgent.get(agent.id)!.runId}
                              liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                              agentName={agent.name}
                            />
                          ) : (
                            <StatusBadge status={agent.status} />
                          )}
                          <span className="font-mono text-xs text-muted-foreground">
                            {(costByAgentId.get(agent.id) ?? 0) > 0
                              ? formatCents(costByAgentId.get(agent.id)!)
                              : <span className="text-muted-foreground/40">&mdash;</span>}
                          </span>
                        </span>
                        <div className="hidden sm:flex items-center gap-3">
                          {liveRunByAgent.has(agent.id) && (
                            <LiveRunIndicator
                              agentRef={agentRouteRef(agent)}
                              runId={liveRunByAgent.get(agent.id)!.runId}
                              liveCount={liveRunByAgent.get(agent.id)!.liveCount}
                              agentName={agent.name}
                            />
                          )}
                          <span className="w-20 whitespace-nowrap text-right font-mono text-xs text-muted-foreground" title="Cost this month">
                            {costByAgentId.has(agent.id) && costByAgentId.get(agent.id)! > 0
                              ? formatCents(costByAgentId.get(agent.id)!)
                              : <span className="text-muted-foreground/40">&mdash;</span>}
                          </span>
                          <span className="w-28 whitespace-nowrap text-right font-mono text-xs text-muted-foreground">
                            {getAdapterLabel(agent.adapterType)}
                          </span>
                          <span className="text-xs text-muted-foreground w-16 text-right">
                            {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "\u2014"}
                          </span>
                          <span className="w-20 flex justify-end">
                            <StatusBadge status={agent.status} />
                          </span>
                        </div>
                      </div>
                    }
                  />
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {effectiveView === "list" && agents && agents.length > 0 && sortedAgents.length === 0 && (
        <div role="status" aria-live="polite" className="flex flex-col items-center justify-center py-12 text-center">
          <Bot className="h-8 w-8 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">
            {searchTrimmed ? "No agents match your search." : "No agents match the selected filter."}
          </p>
        </div>
      )}

      {effectiveView === "org" && isOrgError && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">{orgError instanceof Error ? orgError.message : "Failed to load agents."}</p>
          </div>
          <Button size="sm" variant="ghost" className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0" onClick={() => refetchOrg()}>Retry</Button>
        </div>
      )}

      {effectiveView === "org" && isOrgLoading && agents && agents.length > 0 && (
        <div className="flex justify-center py-8">
          <LoaderCircle className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
          <span className="sr-only" role="status" aria-live="polite">Loading org chart...</span>
        </div>
      )}

      {effectiveView === "org" && filteredOrg.length > 0 && (
        <div className="border border-border py-1">
          {filteredOrg.map((node) => (
            <OrgTreeNode key={node.id} node={node} depth={0} agentMap={agentMap} liveRunByAgent={liveRunByAgent} tab={tab} />
          ))}
        </div>
      )}

      {effectiveView === "org" && orgTree && orgTree.length > 0 && filteredOrg.length === 0 && (
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground text-center py-8">
          No agents match the selected filter.
        </p>
      )}

      {effectiveView === "org" && orgTree && orgTree.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">
          No organizational hierarchy defined.
        </p>
      )}

      {someSelected && (
        <div className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2">
          <div
            role="toolbar"
            aria-label="Bulk actions"
            className="flex items-center gap-3 rounded-none border border-border bg-popover px-4 py-2.5 shadow-xl"
          >
            <span className="text-xs font-medium text-foreground">
              {selectedIds.size} selected
            </span>
            <div className="h-4 w-px bg-border" />
            <button
              type="button"
              onClick={handleBulkPause}
              disabled={pauseMutation.isPending}
              aria-busy={pauseMutation.isPending}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Pause All
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <Download className="h-3 w-3" />
              Export CSV ({selectedIds.size})
            </button>
            <button
              type="button"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={deleteMutation.isPending}
              aria-busy={deleteMutation.isPending}
              className="text-xs text-destructive transition-colors hover:text-destructive/70 disabled:opacity-50"
            >
              Delete All
            </button>
            <div className="h-4 w-px bg-border" />
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      <Dialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selectedIds.size} agent{selectedIds.size !== 1 ? "s" : ""}?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. The selected agent{selectedIds.size !== 1 ? "s" : ""} will be permanently deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDeleteOpen(false)}>Cancel</Button>
            <Button variant="destructive" disabled={deleteMutation.isPending} onClick={handleBulkDelete}>
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortHeader({ col, label, sort, onSort, className }: {
  col: SortCol;
  label: string;
  sort: { col: SortCol; dir: SortDir } | null;
  onSort: (col: SortCol) => void;
  className?: string;
}) {
  const active = sort?.col === col;
  return (
    <button
      type="button"
      aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : "none"}
      onClick={() => onSort(col)}
      className={cn(
        "flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors cursor-pointer",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {label}
      <ChevronUp
        aria-hidden="true"
        className={cn(
          "h-3 w-3 transition-transform",
          active && sort?.dir === "desc" && "rotate-180",
          !active && "opacity-0",
        )}
      />
    </button>
  );
}

function OrgTreeNode({
  node,
  depth,
  agentMap,
  liveRunByAgent,
  tab,
}: {
  node: OrgNode;
  depth: number;
  agentMap: Map<string, Agent>;
  liveRunByAgent: Map<string, { runId: string; liveCount: number }>;
  tab: FilterTab;
}) {
  const agent = agentMap.get(node.id);
  const statusColor = agentStatusDot[node.status] ?? agentStatusDotDefault;

  return (
    <div style={{ paddingLeft: depth * 24 }}>
      <Link
        to={agent ? agentUrl(agent) : `/agents/${node.id}`}
        className={cn("flex items-center gap-3 px-3 py-2 hover:bg-accent/30 transition-colors w-full text-left no-underline text-inherit", agent?.pausedAt && tab !== "paused" && "opacity-50")}
      >
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          {(node.status === "active" || node.status === "running") && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-50 ${agentStatusDot[node.status] ?? agentStatusDotDefault}`} aria-hidden="true" />
          )}
          <span
            role="img"
            aria-label={`Status: ${node.status}`}
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${agentStatusDot[node.status] ?? agentStatusDotDefault}`}
          />
        </span>
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium">{node.name}</span>
          <span className="text-xs text-muted-foreground ml-2">
            {roleLabels[node.role] ?? node.role}
            {agent?.title ? ` - ${agent.title}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="sm:hidden">
            {liveRunByAgent.has(node.id) ? (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
                agentName={node.name}
              />
            ) : (
              <StatusBadge status={node.status} />
            )}
          </span>
          <div className="hidden sm:flex items-center gap-3">
            {liveRunByAgent.has(node.id) && (
              <LiveRunIndicator
                agentRef={agent ? agentRouteRef(agent) : node.id}
                runId={liveRunByAgent.get(node.id)!.runId}
                liveCount={liveRunByAgent.get(node.id)!.liveCount}
                agentName={node.name}
              />
            )}
            {agent && (
              <>
                <span className="w-28 whitespace-nowrap text-right font-mono text-xs text-muted-foreground">
                  {getAdapterLabel(agent.adapterType)}
                </span>
                <span className="text-xs text-muted-foreground w-16 text-right">
                  {agent.lastHeartbeatAt ? relativeTime(agent.lastHeartbeatAt) : "\u2014"}
                </span>
              </>
            )}
            <span className="w-20 flex justify-end">
              <StatusBadge status={node.status} />
            </span>
          </div>
        </div>
      </Link>
      {node.reports && node.reports.length > 0 && (
        <div className="border-l border-border/50 ml-4">
          {node.reports.map((child) => (
            <OrgTreeNode key={child.id} node={child} depth={depth + 1} agentMap={agentMap} liveRunByAgent={liveRunByAgent} tab={tab} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveRunIndicator({
  agentRef,
  runId,
  liveCount,
  agentName,
}: {
  agentRef: string;
  runId: string;
  liveCount: number;
  agentName?: string;
}) {
  return (
    <Link
      to={`/agents/${agentRef}/runs/${runId}`}
      aria-label={agentName ? `View live run for ${agentName}` : "View live run"}
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-500/10 hover:bg-blue-500/20 transition-colors no-underline"
      onClick={(e) => e.stopPropagation()}
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
      </span>
      <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
        Live{liveCount > 1 ? ` (${liveCount})` : ""}
      </span>
    </Link>
  );
}
