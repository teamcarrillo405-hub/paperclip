import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart2,
  TrendingUp,
  Users,
  DollarSign,
  CheckCircle2,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
} from "recharts";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import {
  reportsApi,
  type DailyIssueCount,
  type CostByAgent,
  type CostByCompany,
  type ResolutionRateByAgent,
} from "@/api/reports";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ELECTRIC_BLUE = "#2F80FF";

type Period = "30d" | "90d" | "12m";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "30d", label: "30 Days" },
  { value: "90d", label: "90 Days" },
  { value: "12m", label: "12 Months" },
];

// ---------------------------------------------------------------------------
// Formatting helpers
// ---------------------------------------------------------------------------

function fmt$(value: number): string {
  return `$${value.toFixed(2)}`;
}

function fmtPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function fmtNum(value: number): string {
  return value.toLocaleString();
}

// ---------------------------------------------------------------------------
// Skeleton / loading states
// ---------------------------------------------------------------------------

function StatCardSkeleton() {
  return (
    <div className="border border-border rounded-lg p-4 animate-pulse">
      <div className="h-3 w-24 bg-muted rounded mb-3" />
      <div className="h-7 w-16 bg-muted rounded" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div className="border border-border rounded-lg p-4 animate-pulse">
      <div className="h-4 w-40 bg-muted rounded mb-4" />
      <div className="h-48 bg-muted/40 rounded" />
    </div>
  );
}

function TableSkeleton() {
  return (
    <div className="border border-border rounded-lg overflow-hidden animate-pulse">
      <div className="h-10 bg-muted/30 border-b border-border" />
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="h-12 border-b border-border last:border-0 px-4 flex items-center gap-4">
          <div className="h-3 w-32 bg-muted rounded" />
          <div className="h-3 w-16 bg-muted rounded ml-auto" />
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  icon: React.ReactNode;
  sub?: string;
}

function StatCard({ label, value, icon, sub }: StatCardProps) {
  return (
    <div className="border border-border rounded-lg p-4 bg-card flex flex-col gap-2">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Period selector
// ---------------------------------------------------------------------------

interface PeriodSelectorProps {
  value: Period;
  onChange: (p: Period) => void;
}

function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex items-center gap-1 border border-border rounded-lg p-1">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={[
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            value === opt.value
              ? "bg-accent text-foreground"
              : "text-muted-foreground hover:text-foreground",
          ].join(" ")}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart (CSS-based fallback style, but using recharts)
// ---------------------------------------------------------------------------

interface HBarChartProps<T> {
  data: T[];
  nameKey: keyof T;
  valueKey: keyof T;
  valueLabel: string;
  formatValue?: (v: number) => string;
  emptyMessage?: string;
}

function HBarChart<T>({
  data,
  nameKey,
  valueKey,
  valueLabel,
  formatValue = fmt$,
  emptyMessage = "No data for this period.",
}: HBarChartProps<T>) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">{emptyMessage}</p>
    );
  }

  const maxVal = Math.max(...data.map((d) => Number(d[valueKey])), 1);

  return (
    <div className="space-y-2.5">
      {data.slice(0, 10).map((item, idx) => {
        const val = Number(item[valueKey]);
        const pct = Math.max((val / maxVal) * 100, 1);
        const name = String(item[nameKey] ?? "—");
        return (
          <div key={idx} className="flex items-center gap-3">
            <div
              className="w-36 shrink-0 truncate text-sm text-muted-foreground"
              title={name}
            >
              {name}
            </div>
            <div className="flex-1 min-w-0 h-5 bg-muted rounded-sm overflow-hidden">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: `${pct}%`, backgroundColor: ELECTRIC_BLUE }}
              />
            </div>
            <div className="w-20 text-right text-sm font-medium tabular-nums shrink-0">
              {formatValue(val)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issues Over Time chart
// ---------------------------------------------------------------------------

interface IssuesChartProps {
  data: DailyIssueCount[];
  period: Period;
}

function IssuesChart({ data, period }: IssuesChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No issue data for this period.
      </p>
    );
  }

  // For 12m, aggregate by week to keep the chart readable
  const chartData =
    period === "12m"
      ? aggregateByWeek(data)
      : data.map((d) => ({ ...d, label: d.date.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--background)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 12,
          }}
        />
        <Line
          type="monotone"
          dataKey="created"
          name="Created"
          stroke={ELECTRIC_BLUE}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
        <Line
          type="monotone"
          dataKey="resolved"
          name="Resolved"
          stroke="#00C48C"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function aggregateByWeek(data: DailyIssueCount[]): Array<{ label: string; created: number; resolved: number }> {
  const weeks = new Map<string, { created: number; resolved: number }>();
  for (const d of data) {
    const date = new Date(d.date);
    // ISO week start: Monday
    const day = date.getUTCDay();
    const offset = day === 0 ? -6 : 1 - day;
    const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset));
    const key = monday.toISOString().slice(0, 10);
    const existing = weeks.get(key) ?? { created: 0, resolved: 0 };
    existing.created += d.created;
    existing.resolved += d.resolved;
    weeks.set(key, existing);
  }
  return Array.from(weeks.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, counts]) => ({ label: date.slice(5), ...counts }));
}

// ---------------------------------------------------------------------------
// Resolution rate table
// ---------------------------------------------------------------------------

interface ResolutionTableProps {
  data: ResolutionRateByAgent[];
  isLoading: boolean;
}

function ResolutionTable({ data, isLoading }: ResolutionTableProps) {
  if (isLoading) return <TableSkeleton />;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Agent
            </th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
              Total Issues
            </th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
              Resolved
            </th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">
              Rate
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {data.length === 0 && (
            <tr>
              <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No agent resolution data for this period.
              </td>
            </tr>
          )}
          {data.map((row) => (
            <tr key={row.agentId} className="hover:bg-accent/30 transition-colors">
              <td className="px-4 py-3 text-sm font-medium">{row.agentName}</td>
              <td className="px-4 py-3 text-sm tabular-nums text-right">
                {fmtNum(row.total)}
              </td>
              <td className="px-4 py-3 text-sm tabular-nums text-right">
                {fmtNum(row.resolved)}
              </td>
              <td className="px-4 py-3 text-right">
                <span
                  className={[
                    "inline-block text-sm font-semibold tabular-nums px-1.5 py-0.5 rounded",
                    row.rate >= 80
                      ? "text-green-700 bg-green-100 dark:text-green-300 dark:bg-green-950/60"
                      : row.rate >= 50
                        ? "text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-950/60"
                        : "text-red-700 bg-red-100 dark:text-red-300 dark:bg-red-950/60",
                  ].join(" ")}
                >
                  {fmtPct(row.rate)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ReportsPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [period, setPeriod] = useState<Period>("30d");

  useEffect(() => {
    setBreadcrumbs([{ label: "Reports" }]);
  }, [setBreadcrumbs]);

  // Queries — auto-refresh every 60 seconds
  const overviewQuery = useQuery({
    queryKey: ["reports", "overview", period],
    queryFn: () => reportsApi.getOverview(period),
    refetchInterval: 60_000,
  });

  const issuesByDayQuery = useQuery({
    queryKey: ["reports", "issues-by-day", period],
    queryFn: () => reportsApi.getIssuesByDay(period),
    refetchInterval: 60_000,
    enabled: period !== "12m", // only 30d/90d have daily granularity; 12m uses the same endpoint
  });

  // For 12m we still call the endpoint but at 90d granularity internally aggregated
  const issuesByDayQueryAll = useQuery({
    queryKey: ["reports", "issues-by-day-all", period],
    queryFn: () => reportsApi.getIssuesByDay(period),
    refetchInterval: 60_000,
    enabled: period === "12m",
  });

  const dailyData: DailyIssueCount[] =
    period === "12m"
      ? (issuesByDayQueryAll.data ?? [])
      : (issuesByDayQuery.data ?? []);

  const costByAgentQuery = useQuery({
    queryKey: ["reports", "cost-by-agent", period],
    queryFn: () => reportsApi.getCostByAgent("", period),
    refetchInterval: 60_000,
  });

  const costByCompanyQuery = useQuery({
    queryKey: ["reports", "cost-by-company", period],
    queryFn: () => reportsApi.getCostByCompany(period),
    refetchInterval: 60_000,
  });

  const resolutionQuery = useQuery({
    queryKey: ["reports", "resolution-rate", period],
    queryFn: () => reportsApi.getResolutionRateByAgent("", period),
    refetchInterval: 60_000,
  });

  const ov = overviewQuery.data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-semibold">Reports &amp; Business Intelligence</h1>
        </div>
        <PeriodSelector value={period} onChange={setPeriod} />
      </div>

      {overviewQuery.error && (
        <p className="text-sm text-destructive">
          {overviewQuery.error instanceof Error
            ? overviewQuery.error.message
            : "Failed to load overview data"}
        </p>
      )}

      {/* Row 1 — Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {overviewQuery.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : (
          <>
            <StatCard
              label="Total Issues"
              value={fmtNum(ov?.totalIssues ?? 0)}
              icon={<Activity className="h-4 w-4" />}
              sub={`${fmtNum(ov?.resolvedIssues ?? 0)} resolved`}
            />
            <StatCard
              label="Resolution Rate"
              value={fmtPct(ov?.resolutionRate ?? 0)}
              icon={<CheckCircle2 className="h-4 w-4" />}
              sub={`Avg ${ov?.avgResolutionHours ?? 0}h to resolve`}
            />
            <StatCard
              label="Active Agents"
              value={fmtNum(ov?.activeAgents ?? 0)}
              icon={<Users className="h-4 w-4" />}
              sub={`${fmtNum(ov?.totalCompanies ?? 0)} companies`}
            />
            <StatCard
              label="Total Cost"
              value={fmt$(ov?.totalCostUsd ?? 0)}
              icon={<DollarSign className="h-4 w-4" />}
              sub="AI spend this period"
            />
            <StatCard
              label="Estimated ROI"
              value={fmt$(ov?.estimatedRoiUsd ?? 0)}
              icon={<TrendingUp className="h-4 w-4" />}
              sub="$35/hr labor savings"
            />
          </>
        )}
      </div>

      {/* Row 2 — Issues Over Time */}
      <div className="border border-border rounded-lg p-4 bg-card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold">Issues Over Time</h2>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded" style={{ backgroundColor: ELECTRIC_BLUE }} />
              Created
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-0.5 rounded bg-green-500" />
              Resolved
            </span>
          </div>
        </div>
        {issuesByDayQuery.isLoading || issuesByDayQueryAll.isLoading ? (
          <div className="h-48 bg-muted/40 rounded animate-pulse" />
        ) : (
          <IssuesChart data={dailyData} period={period} />
        )}
      </div>

      {/* Row 3 — Cost by Agent + Cost by Company */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cost by Agent */}
        <div className="border border-border rounded-lg p-4 bg-card">
          <h2 className="text-sm font-semibold mb-4">Cost by Agent (Top 10)</h2>
          {costByAgentQuery.isLoading ? (
            <ChartSkeleton />
          ) : (
            <HBarChart<CostByAgent>
              data={costByAgentQuery.data ?? []}
              nameKey="agentName"
              valueKey="totalCostUsd"
              valueLabel="Cost"
              formatValue={fmt$}
              emptyMessage="No cost data for agents this period."
            />
          )}
        </div>

        {/* Cost by Company */}
        <div className="border border-border rounded-lg p-4 bg-card">
          <h2 className="text-sm font-semibold mb-4">Cost by Company</h2>
          {costByCompanyQuery.isLoading ? (
            <ChartSkeleton />
          ) : (
            <HBarChart<CostByCompany>
              data={costByCompanyQuery.data ?? []}
              nameKey="companyName"
              valueKey="totalCostUsd"
              valueLabel="Cost"
              formatValue={fmt$}
              emptyMessage="No cost data for companies this period."
            />
          )}
        </div>
      </div>

      {/* Row 4 — Agent Resolution Rates table */}
      <div>
        <h2 className="text-sm font-semibold mb-3">Agent Resolution Rates</h2>
        <ResolutionTable
          data={resolutionQuery.data ?? []}
          isLoading={resolutionQuery.isLoading}
        />
      </div>
    </div>
  );
}
