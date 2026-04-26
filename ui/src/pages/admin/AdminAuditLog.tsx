import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Download } from "lucide-react";
import { adminApi, type AuditLogRow } from "@/api/admin";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString();
}

function riskBadge(level: string) {
  const map: Record<string, string> = {
    low: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    medium: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    high: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  return map[level] ?? "bg-muted text-muted-foreground";
}

function outcomeBadge(outcome: string) {
  return outcome === "success"
    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
}

function AuditLogRowComponent({ row }: { row: AuditLogRow }) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = row.details && Object.keys(row.details).length > 0;

  return (
    <>
      <tr
        className={[
          "border-b border-border transition-colors",
          hasDetails ? "cursor-pointer hover:bg-accent/30" : "hover:bg-accent/10",
        ].join(" ")}
        onClick={() => { if (hasDetails) setExpanded((v) => !v); }}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            {hasDetails ? (
              expanded ? (
                <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )
            ) : (
              <span className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">
              {formatTimestamp(row.timestamp)}
            </span>
          </div>
        </td>
        <td className="px-4 py-3 text-xs font-mono text-muted-foreground hidden md:table-cell">
          {row.userId ? row.userId.slice(0, 12) + "…" : row.agentId ? "agent" : "—"}
        </td>
        <td className="px-4 py-3">
          <span className="text-xs font-mono">{row.action}</span>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
          <span>{row.resource}</span>
          {row.resourceId && (
            <span className="ml-1 text-muted-foreground/60">#{row.resourceId.slice(0, 8)}</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span
            className={[
              "inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium",
              outcomeBadge(row.outcome),
            ].join(" ")}
          >
            {row.outcome}
          </span>
        </td>
        <td className="px-4 py-3 hidden lg:table-cell">
          <span
            className={[
              "inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium",
              riskBadge(row.riskLevel),
            ].join(" ")}
          >
            {row.riskLevel}
          </span>
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="px-4 pb-4 pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Details</p>
            <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-x-auto">
              {JSON.stringify(row.details, null, 2)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}

function exportAuditCsv(rows: AuditLogRow[]) {
  const header = ["Timestamp", "User ID", "Action", "Resource", "Resource ID", "Outcome", "Risk Level"];
  const csvRows = rows.map((r) => [
    formatTimestamp(r.timestamp),
    r.userId ?? "",
    r.action,
    r.resource,
    r.resourceId ?? "",
    r.outcome,
    r.riskLevel,
  ]);
  const csv = [header, ...csvRows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "audit-log.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function AdminAuditLog() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  const [filters, setFilters] = useState({
    userId: "",
    companyId: "",
    action: "",
    from: "",
    to: "",
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Enterprise Admin", href: "/admin" },
      { label: "Audit Log" },
    ]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "audit-log", { ...filters, page }],
    queryFn: () =>
      adminApi.getAuditLog({
        page,
        limit: LIMIT,
        userId: filters.userId || undefined,
        companyId: filters.companyId || undefined,
        action: filters.action || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      }),
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
        <Input
          placeholder="User ID..."
          value={filters.userId}
          onChange={(e) => updateFilter("userId", e.target.value)}
          className="font-mono text-sm"
        />
        <Input
          placeholder="Company ID..."
          value={filters.companyId}
          onChange={(e) => updateFilter("companyId", e.target.value)}
          className="font-mono text-sm"
        />
        <Input
          placeholder="Action (e.g. agent.run)..."
          value={filters.action}
          onChange={(e) => updateFilter("action", e.target.value)}
          className="font-mono text-sm"
        />
        <Input
          type="date"
          value={filters.from}
          onChange={(e) => updateFilter("from", e.target.value)}
          className="text-sm"
          title="From date"
        />
        <Input
          type="date"
          value={filters.to}
          onChange={(e) => updateFilter("to", e.target.value)}
          className="text-sm"
          title="To date"
        />
      </div>

      {/* Export button */}
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => data && exportAuditCsv(data.rows)}
          disabled={!data || data.rows.length === 0}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          Export
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load audit log"}
        </p>
      )}

      {/* Table */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Timestamp</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">User</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Action</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Resource</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Outcome</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden lg:table-cell">Risk</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading audit log...
                </td>
              </tr>
            )}
            {!isLoading && data?.rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No audit log entries match your filters.
                </td>
              </tr>
            )}
            {data?.rows.map((row) => (
              <AuditLogRowComponent key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.total > LIMIT && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Showing {(page - 1) * LIMIT + 1}–{Math.min(page * LIMIT, data.total)} of {data.total}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <span className="px-2">Page {page} of {totalPages}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
