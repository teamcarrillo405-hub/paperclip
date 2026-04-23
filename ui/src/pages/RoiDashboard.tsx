import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  DollarSign,
  Clock,
  CheckCircle2,
  FileText,
  ShieldCheck,
  Zap,
  ArrowUpRight,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { roiApi, type RoiPeriod, type RoiTimelinePoint } from "../api/roi";
import { billingApi } from "../api/billing";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Link } from "@/lib/router";

const PERIOD_OPTIONS: { value: RoiPeriod; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}

function formatHours(h: number): string {
  if (h >= 1000) return `${(h / 1000).toFixed(1)}k`;
  return h.toFixed(1);
}

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

interface WeeklyBarPoint {
  week: string;
  dollarsSaved: number;
}

function groupTimelineByWeek(points: RoiTimelinePoint[]): WeeklyBarPoint[] {
  if (points.length === 0) return [];
  const buckets = new Map<string, { startDate: string; dollarsSaved: number }>();
  const start = new Date(`${points[0].date}T00:00:00Z`);
  for (const pt of points) {
    const d = new Date(`${pt.date}T00:00:00Z`);
    const diffDays = Math.floor((d.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    const weekIndex = Math.floor(diffDays / 7);
    const weekStart = new Date(start.getTime() + weekIndex * 7 * 24 * 60 * 60 * 1000);
    const key = weekStart.toISOString().slice(0, 10);
    const existing = buckets.get(key);
    if (existing) {
      existing.dollarsSaved += pt.estimatedDollarsSaved;
    } else {
      buckets.set(key, { startDate: key, dollarsSaved: pt.estimatedDollarsSaved });
    }
  }
  return Array.from(buckets.values())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((b) => ({
      week: formatShortDate(b.startDate),
      dollarsSaved: Number(b.dollarsSaved.toFixed(2)),
    }));
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  sublabel?: string;
  tone?: "default" | "success" | "primary";
}

function StatCard({ icon: Icon, value, label, sublabel, tone = "default" }: StatCardProps) {
  const toneClasses =
    tone === "success"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "primary"
        ? "text-primary"
        : "text-foreground";
  return (
    <Card>
      <CardContent className="px-5 py-1">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className={`text-3xl font-semibold tracking-tight tabular-nums ${toneClasses}`}>
              {value}
            </p>
            <p className="text-sm font-medium text-muted-foreground mt-1">{label}</p>
            {sublabel ? (
              <p className="text-xs text-muted-foreground/70 mt-1">{sublabel}</p>
            ) : null}
          </div>
          <Icon className="h-5 w-5 text-muted-foreground/50 shrink-0 mt-1.5" />
        </div>
      </CardContent>
    </Card>
  );
}

export function RoiDashboard() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [period, setPeriod] = useState<RoiPeriod>("30d");

  useEffect(() => {
    setBreadcrumbs([{ label: "ROI Dashboard" }]);
  }, [setBreadcrumbs]);

  const metricsQuery = useQuery({
    queryKey: ["roi", "metrics", selectedCompanyId, period],
    queryFn: () => roiApi.metrics(selectedCompanyId!, period),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const timelineQuery = useQuery({
    queryKey: ["roi", "timeline", selectedCompanyId, period],
    queryFn: () => roiApi.timeline(selectedCompanyId!, period),
    enabled: !!selectedCompanyId,
    refetchInterval: 60_000,
  });

  const billingQuery = useQuery({
    queryKey: ["billing", "status", selectedCompanyId],
    queryFn: () => billingApi.status(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={TrendingUp}
          message="Select a company to view your ROI dashboard."
        />
      </div>
    );
  }

  if (metricsQuery.isLoading || timelineQuery.isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  if (metricsQuery.error || !metricsQuery.data) {
    return (
      <div className="p-6">
        <EmptyState
          icon={TrendingUp}
          message={
            metricsQuery.error instanceof Error
              ? `Failed to load ROI metrics: ${metricsQuery.error.message}`
              : "Failed to load ROI metrics."
          }
        />
      </div>
    );
  }

  const metrics = metricsQuery.data;
  const timeline = timelineQuery.data?.points ?? [];
  const weeklyData = groupTimelineByWeek(timeline);
  const showArCard = metrics.invoicesSentByAgent > 0 || metrics.arAmountRecovered > 0;
  const showGuardianCard = metrics.incidentsResolvedByGuardian > 0;
  const isStarter = billingQuery.data?.planId === "starter";

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">ROI Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Concrete value delivered by your agents — hours saved, money recovered, tasks automated.
          </p>
        </div>
        <div className="flex gap-1 rounded-md border border-border p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1 text-xs rounded-sm transition-colors ${
                period === opt.value
                  ? "bg-accent text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={DollarSign}
          value={formatCurrency(metrics.estimatedDollarsSaved)}
          label="Estimated $ Saved"
          sublabel={`Based on ${formatHours(metrics.estimatedHoursSaved)} hours`}
          tone="success"
        />
        <StatCard
          icon={Clock}
          value={formatHours(metrics.estimatedHoursSaved)}
          label="Hours Saved"
          sublabel="At 15 minutes per task"
        />
        <StatCard
          icon={CheckCircle2}
          value={formatNumber(metrics.tasksAutomatedThisPeriod)}
          label="Tasks Automated"
          sublabel={`${formatNumber(metrics.tasksAutomatedTotal)} all-time`}
        />
        <StatCard
          icon={TrendingUp}
          value={`${metrics.roiMultiple.toFixed(1)}x`}
          label="ROI Multiple"
          sublabel={
            metrics.monthlyPlanCost > 0
              ? `Vs. ${formatCurrency(metrics.monthlyPlanCost)}/mo plan`
              : "Add a plan to compute ROI"
          }
          tone="primary"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Tasks per day</CardTitle>
            <CardDescription>Tasks automated by agents over the last {period}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {timeline.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No tasks completed in this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={timeline} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis
                      dataKey="date"
                      tickFormatter={formatShortDate}
                      className="text-xs"
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      allowDecimals={false}
                      className="text-xs"
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      labelFormatter={(val: string) => formatShortDate(val)}
                      formatter={(val: number) => [formatNumber(val), "Tasks"]}
                    />
                    <Line
                      type="monotone"
                      dataKey="tasksCompleted"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      activeDot={{ r: 5 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Estimated $ saved per week</CardTitle>
            <CardDescription>Weekly labor value recovered by agent work</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              {weeklyData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                  No savings to report yet.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="week" className="text-xs" tick={{ fontSize: 11 }} />
                    <YAxis
                      className="text-xs"
                      tick={{ fontSize: 11 }}
                      tickFormatter={(v: number) => `$${v}`}
                    />
                    <Tooltip
                      formatter={(val: number) => [formatCurrency(val), "Saved"]}
                    />
                    <Bar dataKey="dollarsSaved" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {showArCard ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">AR Recovery</CardTitle>
              </div>
              <CardDescription>Invoicing & collections by agent</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Invoices sent</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatNumber(metrics.invoicesSentByAgent)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Amount recovered</span>
                <span className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(metrics.arAmountRecovered)}
                </span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {showGuardianCard ? (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Guardian Savings</CardTitle>
              </div>
              <CardDescription>Incidents auto-resolved, runs protected</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Incidents resolved</span>
                <span className="text-lg font-semibold tabular-nums">
                  {formatNumber(metrics.incidentsResolvedByGuardian)}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-sm text-muted-foreground">Agent uptime</span>
                <span className="text-lg font-semibold tabular-nums">
                  {metrics.agentUptimePercent.toFixed(1)}%
                </span>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Run Activity</CardTitle>
            </div>
            <CardDescription>Production work shipped this week</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Runs completed</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatNumber(metrics.runsCompletedThisWeek)}
              </span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-muted-foreground">Tasks this month</span>
              <span className="text-lg font-semibold tabular-nums">
                {formatNumber(metrics.tasksAutomatedThisMonth)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {isStarter ? (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="px-6 flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[240px]">
              <h3 className="text-base font-semibold">Unlock more ROI with the Growth plan</h3>
              <p className="text-sm text-muted-foreground mt-1">
                You're on Starter. Growth unlocks more agents, more companies, and higher throughput —
                typically 3x the monthly tasks automated.
              </p>
            </div>
            <Button asChild>
              <Link to="/pricing">
                Upgrade plan
                <ArrowUpRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground/70">{metrics.disclaimer}</p>
    </div>
  );
}
