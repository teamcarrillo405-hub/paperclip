import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@/lib/router";
import { Users, Building2, Bot, CircleDot, DollarSign, Server, BarChart2, ScrollText, BookLock } from "lucide-react";
import { adminApi } from "@/api/admin";
import { healthApi } from "@/api/health";
import { MetricCard } from "@/components/MetricCard";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { formatCents } from "@/lib/utils";
import { PageSkeleton } from "@/components/PageSkeleton";

const QUICK_LINKS = [
  { to: "/admin/users", label: "Manage Users", icon: Users, description: "View and manage all users" },
  { to: "/admin/usage", label: "Usage Analytics", icon: BarChart2, description: "AI spend breakdown" },
  { to: "/admin/model-policies", label: "Model Policies", icon: BookLock, description: "Control model access" },
  { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText, description: "Review system events" },
  { to: "/admin/system", label: "System Info", icon: Server, description: "Server and DB status" },
];

export function AdminOverview() {
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Enterprise Admin", href: "/admin" }, { label: "Overview" }]);
  }, [setBreadcrumbs]);

  const systemQuery = useQuery({
    queryKey: ["admin", "system"],
    queryFn: () => adminApi.getSystem(),
  });

  const usageQuery = useQuery({
    queryKey: ["admin", "usage", "30d", "company"],
    queryFn: () => adminApi.getUsage({ period: "30d", groupBy: "company" }),
  });

  const healthQuery = useQuery({
    queryKey: ["health"],
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthSpend = usageQuery.data?.rows.reduce((sum, r) => sum + r.totalCents, 0) ?? 0;

  if (systemQuery.isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const sys = systemQuery.data;

  return (
    <div className="space-y-6">
      {systemQuery.error && (
        <p className="text-sm text-destructive">
          {systemQuery.error instanceof Error ? systemQuery.error.message : "Failed to load system info"}
        </p>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-1 sm:gap-2">
        <div className="border border-border rounded-lg">
          <MetricCard
            icon={Users}
            value={sys?.totalUsers ?? 0}
            label="Total Users"
            to="/admin/users"
          />
        </div>
        <div className="border border-border rounded-lg">
          <MetricCard
            icon={Building2}
            value={sys?.totalCompanies ?? 0}
            label="Total Companies"
          />
        </div>
        <div className="border border-border rounded-lg">
          <MetricCard
            icon={Bot}
            value={sys?.totalAgents ?? 0}
            label="Total Agents"
          />
        </div>
        <div className="border border-border rounded-lg">
          <MetricCard
            icon={CircleDot}
            value={sys?.totalIssues ?? 0}
            label="Total Issues"
          />
        </div>
      </div>

      {/* Usage and health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="border border-border rounded-lg">
          <MetricCard
            icon={DollarSign}
            value={formatCents(monthSpend)}
            label="AI Spend This Month"
            to="/admin/usage"
            description={
              usageQuery.data
                ? <span>{usageQuery.data.rows.length} companies with spend</span>
                : undefined
            }
          />
        </div>

        <div className="border border-border rounded-lg p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-muted-foreground mt-1">System Health</p>
              <div className="mt-2 space-y-1">
                <div className="flex items-center gap-2 text-sm">
                  <span
                    className={[
                      "h-2 w-2 rounded-full shrink-0",
                      healthQuery.data ? "bg-green-500" : "bg-red-500",
                    ].join(" ")}
                  />
                  <span className="text-foreground font-medium">
                    {healthQuery.data ? "Online" : "Offline"}
                  </span>
                </div>
                {healthQuery.data?.version && (
                  <p className="text-xs text-muted-foreground/70">
                    Version {healthQuery.data.version}
                  </p>
                )}
                {sys?.uptimeFormatted && (
                  <p className="text-xs text-muted-foreground/70">
                    Uptime: {sys.uptimeFormatted}
                  </p>
                )}
              </div>
            </div>
            <Server className="h-4 w-4 text-muted-foreground/50 shrink-0 mt-1.5" />
          </div>
        </div>
      </div>

      {/* Quick links */}
      <div>
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Quick Access
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {QUICK_LINKS.map(({ to, label, icon: Icon, description }) => (
            <Link
              key={to}
              to={to}
              className="group flex items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50 no-underline text-inherit"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
