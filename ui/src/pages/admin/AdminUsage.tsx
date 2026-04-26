import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { adminApi, type UsageRow } from "@/api/admin";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { formatCents } from "@/lib/utils";

type Period = "7d" | "30d" | "90d";
type GroupBy = "company" | "user" | "agent";

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "90d", label: "90 days" },
];

const GROUP_OPTIONS: { value: GroupBy; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "user", label: "Model" },
  { value: "agent", label: "Agent" },
];

function CssBarChart({ rows }: { rows: UsageRow[] }) {
  const maxCents = Math.max(...rows.map((r) => r.totalCents), 1);
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground py-4">No data for this period.</p>;
  }
  return (
    <div className="space-y-2.5">
      {rows.slice(0, 15).map((row) => {
        const pct = Math.max((row.totalCents / maxCents) * 100, 1);
        return (
          <div key={row.id} className="flex items-center gap-3">
            <div className="w-36 shrink-0 truncate text-sm text-muted-foreground" title={row.name ?? row.id}>
              {row.name ?? row.id.slice(0, 12)}
            </div>
            <div className="flex-1 min-w-0 h-5 bg-muted rounded-sm overflow-hidden">
              <div
                className="h-full bg-primary/70 rounded-sm transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="w-20 text-right text-sm font-medium tabular-nums shrink-0">
              {formatCents(row.totalCents)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TrendIcon({ value }: { value: number }) {
  if (value > 0) return <TrendingUp className="h-4 w-4 text-red-500" />;
  if (value < 0) return <TrendingDown className="h-4 w-4 text-green-500" />;
  return <Minus className="h-4 w-4 text-muted-foreground" />;
}

function SpendTable({ rows }: { rows: UsageRow[] }) {
  const total = rows.reduce((sum, r) => sum + r.totalCents, 0);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border bg-muted/30">
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Spend</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right hidden sm:table-cell">% of Total</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Events</th>
            <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Trend</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                No spend data for this period.
              </td>
            </tr>
          )}
          {rows.map((row, idx) => {
            const pct = total > 0 ? ((row.totalCents / total) * 100).toFixed(1) : "0.0";
            return (
              <tr key={row.id ?? idx} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3">
                  <div className="text-sm font-medium">{row.name ?? "—"}</div>
                  {row.companyName && (
                    <div className="text-xs text-muted-foreground">{row.companyName}</div>
                  )}
                  {row.provider && (
                    <div className="text-xs text-muted-foreground">{row.provider}</div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm font-medium tabular-nums text-right">
                  {formatCents(row.totalCents)}
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground text-right hidden sm:table-cell">
                  {pct}%
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground hidden sm:table-cell">
                  {row.eventCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 hidden md:table-cell">
                  <TrendIcon value={0} />
                </td>
              </tr>
            );
          })}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="border-t border-border bg-muted/20">
              <td className="px-4 py-3 text-sm font-semibold">Total</td>
              <td className="px-4 py-3 text-sm font-semibold tabular-nums text-right">{formatCents(total)}</td>
              <td className="hidden sm:table-cell" />
              <td className="hidden sm:table-cell" />
              <td className="hidden md:table-cell" />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

function TopList({
  title,
  items,
  nameKey,
  idKey,
}: {
  title: string;
  items: Array<{ totalCents: number; [key: string]: unknown }> | undefined;
  nameKey: string;
  idKey: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        {title}
      </h3>
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">#</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide text-right">Spend</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!items && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-sm text-muted-foreground">
                  Loading...
                </td>
              </tr>
            )}
            {items?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-4 text-center text-sm text-muted-foreground">
                  No data this month.
                </td>
              </tr>
            )}
            {items?.map((item, idx) => (
              <tr key={String(item[idKey])} className="hover:bg-accent/30 transition-colors">
                <td className="px-4 py-3 text-sm text-muted-foreground">{idx + 1}</td>
                <td className="px-4 py-3 text-sm">{String(item[nameKey] ?? "—")}</td>
                <td className="px-4 py-3 text-sm font-medium tabular-nums text-right">
                  {formatCents(item.totalCents)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdminUsage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [period, setPeriod] = useState<Period>("30d");
  const [groupBy, setGroupBy] = useState<GroupBy>("company");

  useEffect(() => {
    setBreadcrumbs([
      { label: "Enterprise Admin", href: "/admin" },
      { label: "Usage" },
    ]);
  }, [setBreadcrumbs]);

  const usageQuery = useQuery({
    queryKey: ["admin", "usage", period, groupBy],
    queryFn: () => adminApi.getUsage({ period, groupBy }),
  });

  const topAgentsQuery = useQuery({
    queryKey: ["admin", "usage", "top-agents"],
    queryFn: () => adminApi.getTopAgents(),
  });

  const topCompaniesQuery = useQuery({
    queryKey: ["admin", "usage", "top-companies"],
    queryFn: () => adminApi.getTopCompanies(),
  });

  const rows = usageQuery.data?.rows ?? [];

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1 border border-border rounded-lg p-1">
          {PERIOD_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPeriod(opt.value)}
              className={[
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                period === opt.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 border border-border rounded-lg p-1">
          {GROUP_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setGroupBy(opt.value)}
              className={[
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                groupBy === opt.value
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {usageQuery.error && (
        <p className="text-sm text-destructive">
          {usageQuery.error instanceof Error ? usageQuery.error.message : "Failed to load usage data"}
        </p>
      )}

      {/* Bar chart */}
      <div className="border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-4">
          Spend by {groupBy === "user" ? "Model" : groupBy.charAt(0).toUpperCase() + groupBy.slice(1)} — Last {period}
        </h3>
        {usageQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading chart...</p>
        ) : (
          <CssBarChart rows={rows} />
        )}
      </div>

      {/* Detail table */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Breakdown
        </h3>
        {usageQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <SpendTable rows={rows} />
        )}
      </div>

      {/* Top 10 sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TopList
          title="Top 10 Agents This Month"
          items={topAgentsQuery.data}
          nameKey="agentName"
          idKey="agentId"
        />
        <TopList
          title="Top 10 Companies This Month"
          items={topCompaniesQuery.data}
          nameKey="companyName"
          idKey="companyId"
        />
      </div>
    </div>
  );
}
