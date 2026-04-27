import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { dashboardApi } from "../api/dashboard";
import { activityApi } from "../api/activity";
import { accessApi } from "../api/access";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { projectsApi } from "../api/projects";
import { buildCompanyUserProfileMap } from "../lib/company-members";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { MetricCard } from "../components/MetricCard";
import { EmptyState } from "../components/EmptyState";
import { StatusIcon } from "../components/StatusIcon";

import { ActivityRow } from "../components/ActivityRow";
import { Identity } from "../components/Identity";
import { timeAgo } from "../lib/timeAgo";
import { cn, formatCents } from "../lib/utils";
import { Bot, CircleDot, DollarSign, ShieldCheck, LayoutDashboard, PauseCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ActiveAgentsPanel } from "../components/ActiveAgentsPanel";
import { ChartCard, RunActivityChart, PriorityChart, IssueStatusChart, SuccessRateChart } from "../components/ActivityCharts";
import { PageSkeleton } from "../components/PageSkeleton";
import type { Agent, Issue } from "@paperclipai/shared";
import { PluginSlotOutlet } from "@/plugins/slots";
import { useCompanyLiveEvents } from "../hooks/useCompanyLiveEvents";

const DASHBOARD_ACTIVITY_LIMIT = 10;

function getRecentIssues(issues: Issue[]): Issue[] {
  return [...issues]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

// Fallback polling interval used when the WebSocket is not connected.
// The global LiveUpdatesProvider drives real-time invalidation when the
// socket is open, so these intervals only matter as a safety net.
const DASHBOARD_POLL_INTERVAL_MS = 60_000;

export function Dashboard() {
  const { selectedCompanyId, selectedCompany, companies } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [animatedActivityIds, setAnimatedActivityIds] = useState<Set<string>>(new Set());
  const seenActivityIdsRef = useRef<Set<string>>(new Set());
  const hydratedActivityRef = useRef(false);
  const activityAnimationTimersRef = useRef<number[]>([]);
  const CHART_DAYS_KEY = "avero:dashboard:chartDays";
  const [chartDays, setChartDaysState] = useState<7 | 14 | 30>(() => {
    try {
      const v = localStorage.getItem(CHART_DAYS_KEY);
      if (v === "7" || v === "14" || v === "30") return Number(v) as 7 | 14 | 30;
    } catch {}
    return 14;
  });
  function setChartDays(days: 7 | 14 | 30) {
    try { localStorage.setItem(CHART_DAYS_KEY, String(days)); } catch {}
    setChartDaysState(days);
  }
  const [syncedSecondsAgo, setSyncedSecondsAgo] = useState(0);
  const lastSyncRef = useRef(Date.now());
  // Tracks the previous isSyncing value to detect the transition from true → false.
  const wasSyncingRef = useRef(false);
  const [syncAnnouncement, setSyncAnnouncement] = useState("");

  // isConnected reflects the state of the per-Dashboard WebSocket connection.
  // The global LiveUpdatesProvider already handles query invalidation and
  // toasts for all pages; this hook is used solely to drive the "Live"
  // indicator on the Agents panel header and to confirm the socket is open
  // before trusting the 60-second fallback polling interval.
  const { isConnected } = useCompanyLiveEvents(selectedCompanyId ?? undefined);

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Dashboard" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error, refetch, isRefetching } = useQuery({
    queryKey: queryKeys.dashboard(selectedCompanyId!),
    queryFn: () => dashboardApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  });

  const { data: activity, error: activityError, refetch: refetchActivity } = useQuery({
    queryKey: [...queryKeys.activity(selectedCompanyId!), { limit: DASHBOARD_ACTIVITY_LIMIT }],
    queryFn: () => activityApi.list(selectedCompanyId!, { limit: DASHBOARD_ACTIVITY_LIMIT }),
    enabled: !!selectedCompanyId,
    refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  });

  const { data: issues, error: issuesError, refetch: refetchIssues } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  });

  const { data: projects } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: DASHBOARD_POLL_INTERVAL_MS,
  });

  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  // Reset the last-synced timer whenever the dashboard data refreshes.
  // Announce "Synced" once per sync cycle via the dedicated sr-only live region.
  useEffect(() => {
    if (data) {
      lastSyncRef.current = Date.now();
      setSyncedSecondsAgo(0);
      // Fire the announcement only when transitioning from a loading/refetching
      // state back to settled (i.e. when a sync actually completed).
      if (wasSyncingRef.current) {
        setSyncAnnouncement("Synced");
        wasSyncingRef.current = false;
      }
    }
  }, [data]);

  const userProfileMap = useMemo(
    () => buildCompanyUserProfileMap(companyMembers?.users),
    [companyMembers?.users],
  );

  const recentIssues = issues ? getRecentIssues(issues) : [];
  const recentActivity = useMemo(() => (activity ?? []).slice(0, 10), [activity]);

  useEffect(() => {
    for (const timer of activityAnimationTimersRef.current) {
      window.clearTimeout(timer);
    }
    activityAnimationTimersRef.current = [];
    seenActivityIdsRef.current = new Set();
    hydratedActivityRef.current = false;
    setAnimatedActivityIds(new Set());
  }, [selectedCompanyId]);

  useEffect(() => {
    if (recentActivity.length === 0) return;

    const seen = seenActivityIdsRef.current;
    const currentIds = recentActivity.map((event) => event.id);

    if (!hydratedActivityRef.current) {
      for (const id of currentIds) seen.add(id);
      hydratedActivityRef.current = true;
      return;
    }

    const newIds = currentIds.filter((id) => !seen.has(id));
    if (newIds.length === 0) {
      for (const id of currentIds) seen.add(id);
      return;
    }

    setAnimatedActivityIds((prev) => {
      const next = new Set(prev);
      for (const id of newIds) next.add(id);
      return next;
    });

    for (const id of newIds) seen.add(id);

    const timer = window.setTimeout(() => {
      setAnimatedActivityIds((prev) => {
        const next = new Set(prev);
        for (const id of newIds) next.delete(id);
        return next;
      });
      activityAnimationTimersRef.current = activityAnimationTimersRef.current.filter((t) => t !== timer);
    }, 980);
    activityAnimationTimersRef.current.push(timer);
  }, [recentActivity]);

  useEffect(() => {
    return () => {
      for (const timer of activityAnimationTimersRef.current) {
        window.clearTimeout(timer);
      }
    };
  }, []);

  // Track when a refetch begins so we can announce once on completion.
  useEffect(() => {
    if (isRefetching) {
      wasSyncingRef.current = true;
    }
  }, [isRefetching]);

  // Interval changed from 10_000 to 1_000 so the "just now" / "Xs ago"
  // counter updates smoothly. The previous 10 s tick meant the display lagged
  // visibly behind the 5 s "just now" threshold.
  useEffect(() => {
    const id = setInterval(() => {
      setSyncedSecondsAgo(Math.floor((Date.now() - lastSyncRef.current) / 1000));
    }, 1_000);
    return () => clearInterval(id);
  }, []);

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.identifier ?? i.id.slice(0, 8));
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const p of projects ?? []) map.set(`project:${p.id}`, p.name);
    return map;
  }, [issues, agents, projects]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of issues ?? []) map.set(`issue:${i.id}`, i.title);
    return map;
  }, [issues]);

  const agentName = (id: string | null) => {
    if (!id || !agents) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  if (!selectedCompanyId) {
    if (companies.length === 0) {
      return (
        <EmptyState
          icon={LayoutDashboard}
          message="Welcome to Paperclip. Set up your first company and agent to get started."
          action="Get Started"
          onAction={openOnboarding}
        />
      );
    }
    return (
      <EmptyState icon={LayoutDashboard} message="Create or select a company to view the dashboard." />
    );
  }

  if (isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const hasNoAgents = agents !== undefined && agents.length === 0;

  const liveRunCount = data?.agents.running ?? 0;

  return (
    <div className="space-y-6">
      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">{error.message || "Failed to load dashboard."}</p>
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

      {/* Page header: company name + live agent count + last-synced */}
      <div>
        {/* h1 size: text-xl font-bold -> text-2xl font-semibold tracking-tight (project heading standard) */}
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {selectedCompany?.name ?? "Dashboard"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {liveRunCount > 0 && (
            <span>{liveRunCount} agent{liveRunCount !== 1 ? "s" : ""} running{" · "}</span>
          )}
          {/* No aria-live here — the counter updates every second which would
              cause constant screen reader interruptions. Announcements are
              instead emitted once per sync cycle via the sr-only region below. */}
          <span>Last synced {syncedSecondsAgo < 5 ? "just now" : syncedSecondsAgo < 60 ? `${syncedSecondsAgo}s ago` : `${Math.floor(syncedSecondsAgo / 60)}m ago`}</span>
        </p>
        {/* Dedicated live region: only updates once when a sync completes. */}
        <span className="sr-only" aria-live="polite" aria-atomic="true">{syncAnnouncement}</span>
      </div>

      {hasNoAgents && (
        // Amber tokens replaced with yellow-500 opacity variants — works in both
        // light and dark mode without requiring a custom warning semantic token.
        <div className="flex items-center justify-between gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" aria-hidden="true" />
            <p className="text-sm text-foreground">
              You have no agents.
            </p>
          </div>
          <Button
            variant="link"
            className="h-auto p-0 text-sm font-medium underline"
            onClick={() => openOnboarding({ initialStep: 2, companyId: selectedCompanyId! })}
          >
            Create one here
          </Button>
        </div>
      )}

      <ActiveAgentsPanel companyId={selectedCompanyId!} isLive={isConnected} />

      {data && (
        <>
          {data.budgets.activeIncidents > 0 ? (
            // Budget alert: hardcoded red gradient replaced with semantic destructive tokens
            // so the banner adapts correctly in both light and dark mode.
            <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <PauseCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-destructive">
                    {data.budgets.activeIncidents} active budget incident{data.budgets.activeIncidents === 1 ? "" : "s"}
                  </p>
                  <p className="text-xs text-destructive/70">
                    {data.budgets.pausedAgents} agents paused · {data.budgets.pausedProjects} projects paused · {data.budgets.pendingApprovals} pending budget approvals
                  </p>
                </div>
              </div>
              <Link to="/costs" className="text-sm underline underline-offset-2 text-destructive">
                Open budgets
              </Link>
            </div>
          ) : null}

          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Overview</h2>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
            <MetricCard
              icon={Bot}
              value={data.agents.active + data.agents.running + data.agents.paused + data.agents.error}
              label="Agents Enabled"
              to="/agents"
              description={
                <span>
                  {data.agents.running} running{", "}
                  {data.agents.paused} paused{", "}
                  {data.agents.error} errors
                </span>
              }
            />
            <MetricCard
              icon={CircleDot}
              value={data.tasks.inProgress}
              label="Tasks In Progress"
              to="/issues"
              description={
                <span>
                  {data.tasks.open} open{", "}
                  {data.tasks.blocked} blocked
                </span>
              }
            />
            <MetricCard
              icon={DollarSign}
              value={formatCents(data.costs.monthSpendCents)}
              label="Month Spend"
              to="/costs"
              description={
                <span>
                  {data.costs.monthBudgetCents > 0
                    ? `${data.costs.monthUtilizationPercent}% of ${formatCents(data.costs.monthBudgetCents)} budget`
                    : "Unlimited budget"}
                </span>
              }
            />
            <MetricCard
              icon={ShieldCheck}
              value={data.pendingApprovals + data.budgets.pendingApprovals}
              label="Pending Approvals"
              to="/approvals"
              description={
                <span>
                  {data.budgets.pendingApprovals > 0
                    ? `${data.budgets.pendingApprovals} budget overrides awaiting board review`
                    : "Awaiting board review"}
                </span>
              }
            />
          </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Activity</h2>
              <div
                role="group"
                aria-label="Chart time range"
                className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5"
              >
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={chartDays === d}
                    aria-label={`Last ${d} days`}
                    onClick={() => setChartDays(d)}
                    className={cn(
                      "px-2.5 py-1 text-xs font-medium rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                      chartDays === d
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <section aria-label="Run activity chart">
                <ChartCard title="Run Activity" subtitle={`Last ${chartDays} days`}>
                  <RunActivityChart activity={data.runActivity} days={chartDays} />
                </ChartCard>
              </section>
              <section aria-label="Issues by priority chart">
                <ChartCard title="Issues by Priority" subtitle={`Last ${chartDays} days`}>
                  <PriorityChart issues={issues ?? []} days={chartDays} />
                </ChartCard>
              </section>
              <section aria-label="Issues by status chart">
                <ChartCard title="Issues by Status" subtitle={`Last ${chartDays} days`}>
                  <IssueStatusChart issues={issues ?? []} days={chartDays} />
                </ChartCard>
              </section>
              <section aria-label="Success rate chart">
                <ChartCard title="Success Rate" subtitle={`Last ${chartDays} days`}>
                  <SuccessRateChart activity={data.runActivity} days={chartDays} />
                </ChartCard>
              </section>
            </div>
          </div>

          <PluginSlotOutlet
            slotTypes={["dashboardWidget"]}
            context={{ companyId: selectedCompanyId }}
            className="grid gap-4 md:grid-cols-2"
            itemClassName="rounded-lg border bg-card p-4 shadow-sm"
          />

          <section>
          <h2 className="sr-only">Recent activity and tasks</h2>
          <div className="grid md:grid-cols-2 gap-4">
            {/* Recent Activity */}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Recent Activity
              </h3>
              {activityError ? (
                <div role="alert" className="flex items-center gap-2">
                  <p className="text-xs text-destructive">Could not load activity.</p>
                  <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs text-destructive/70 hover:text-destructive" onClick={() => refetchActivity()}>Retry</Button>
                </div>
              ) : recentActivity.length === 0 ? (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">No recent activity.</p>
                  <Link to="/inbox" className="text-xs text-primary hover:underline mt-1 block">View inbox</Link>
                </div>
              ) : (
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {recentActivity.map((event) => (
                    <ActivityRow
                      key={event.id}
                      event={event}
                      agentMap={agentMap}
                      userProfileMap={userProfileMap}
                      entityNameMap={entityNameMap}
                      entityTitleMap={entityTitleMap}
                      className={animatedActivityIds.has(event.id) ? "activity-row-enter" : undefined}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Recent Tasks */}
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Recent Tasks
              </h3>
              {issuesError ? (
                <div role="alert" className="flex items-center gap-2">
                  <p className="text-xs text-destructive">Could not load tasks.</p>
                  <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs text-destructive/70 hover:text-destructive" onClick={() => refetchIssues()}>Retry</Button>
                </div>
              ) : recentIssues.length === 0 ? (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm text-muted-foreground">No tasks yet.</p>
                  <Link to="/projects" className="text-xs text-primary hover:underline mt-1 block">View projects</Link>
                </div>
              ) : (
                <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
                  {recentIssues.slice(0, 10).map((issue) => (
                    <Link
                      key={issue.id}
                      to={`/issues/${issue.identifier ?? issue.id}`}
                      aria-label={`${issue.identifier ?? ""} ${issue.title}${issue.status ? ` — ${issue.status}` : ""}${issue.assigneeAgentId ? ` assigned to ${agentName(issue.assigneeAgentId) ?? "an agent"}` : ""}`.trim()}
                      className="px-4 py-3 text-sm cursor-pointer hover:bg-accent/50 transition-colors no-underline text-inherit block"
                    >
                      <div className="flex items-start gap-2 sm:items-center sm:gap-3">
                        {/* Status icon - left column on mobile */}
                        <span className="shrink-0 sm:hidden">
                          <StatusIcon status={issue.status} />
                        </span>

                        {/* Right column on mobile: title + metadata stacked */}
                        <span className="flex min-w-0 flex-1 flex-col gap-1 sm:contents">
                          <span className="line-clamp-2 text-sm sm:order-2 sm:flex-1 sm:min-w-0 sm:line-clamp-none sm:truncate">
                            {issue.title}
                          </span>
                          <span className="flex items-center gap-2 sm:order-1 sm:shrink-0">
                            <span className="hidden sm:inline-flex"><StatusIcon status={issue.status} /></span>
                            <span className="text-xs font-mono text-muted-foreground">
                              {issue.identifier ?? issue.id.slice(0, 8)}
                            </span>
                            {issue.assigneeAgentId && (() => {
                              const name = agentName(issue.assigneeAgentId);
                              return name
                                ? <span className="hidden sm:inline-flex"><Identity name={name} size="sm" /></span>
                                : null;
                            })()}
                            <span className="text-xs text-muted-foreground sm:hidden" aria-hidden="true">·</span>
                            <span className="text-xs text-muted-foreground shrink-0 sm:order-last">
                              {timeAgo(issue.updatedAt)}
                            </span>
                          </span>
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
          </section>

        </>
      )}
    </div>
  );
}
