import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Server, Database, Activity, Layers } from "lucide-react";
import { adminApi } from "@/api/admin";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";

function bytesToMb(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

function MemoryBar({ used, total }: { used: number; total: number }) {
  const pct = total > 0 ? Math.min((used / total) * 100, 100) : 0;
  const color = pct > 80 ? "bg-red-500" : pct > 60 ? "bg-amber-500" : "bg-green-500";
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 min-w-0 h-2.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground w-32 shrink-0 text-right">
        {bytesToMb(used)} / {bytesToMb(total)} MB ({pct.toFixed(1)}%)
      </span>
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function AdminSystem() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Enterprise Admin", href: "/admin" },
      { label: "System" },
    ]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => adminApi.getSystem(),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading system info...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load system info"}
      </p>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">System Information</h2>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Server stats */}
      <section className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Server className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Server</h3>
          <span
            className={[
              "ml-auto inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
              data?.env === "production"
                ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                : "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
            ].join(" ")}
          >
            {data?.env ?? "unknown"}
          </span>
        </div>
        <div className="space-y-0">
          <StatRow label="Node.js Version" value={data?.nodeVersion ?? "—"} />
          <StatRow label="Uptime" value={data?.uptimeFormatted ?? "—"} />
        </div>

        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wide">
            Memory Usage
          </p>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Heap</p>
              <MemoryBar
                used={data?.memoryUsage.heapUsed ?? 0}
                total={data?.memoryUsage.heapTotal ?? 1}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">RSS</p>
              <MemoryBar
                used={data?.memoryUsage.rss ?? 0}
                total={data?.memoryUsage.rss ?? 1}
              />
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
            <span>RSS: {bytesToMb(data?.memoryUsage.rss ?? 0)} MB</span>
            <span>External: {bytesToMb(data?.memoryUsage.external ?? 0)} MB</span>
            <span>Heap Used: {bytesToMb(data?.memoryUsage.heapUsed ?? 0)} MB</span>
            <span>Heap Total: {bytesToMb(data?.memoryUsage.heapTotal ?? 0)} MB</span>
          </div>
        </div>
      </section>

      {/* Database */}
      <section className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Database</h3>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            Connected
          </span>
        </div>
        <StatRow label="PostgreSQL Version" value={data?.dbVersion ?? "—"} />
      </section>

      {/* Entity counts */}
      <section className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Layers className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Entity Counts</h3>
        </div>
        <div className="space-y-0">
          <StatRow label="Total Users" value={(data?.totalUsers ?? 0).toLocaleString()} />
          <StatRow label="Total Companies" value={(data?.totalCompanies ?? 0).toLocaleString()} />
          <StatRow label="Total Agents" value={(data?.totalAgents ?? 0).toLocaleString()} />
          <StatRow label="Total Issues" value={(data?.totalIssues ?? 0).toLocaleString()} />
          <StatRow label="Total Cost Events" value={(data?.totalCostEvents ?? 0).toLocaleString()} />
        </div>
      </section>

      {/* Runtime summary */}
      <section className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Runtime</h3>
        </div>
        <StatRow label="Process PID" value={typeof window !== "undefined" ? "N/A (client)" : "—"} />
        <StatRow
          label="Uptime (seconds)"
          value={(data?.uptime ?? 0).toFixed(0)}
        />
      </section>
    </div>
  );
}
