import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, Search, Download, UserX } from "lucide-react";
import { adminApi, type AdminUser } from "@/api/admin";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToast } from "@/context/ToastContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatDate(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleDateString();
}

function exportCsv(users: AdminUser[]) {
  const header = ["ID", "Email", "Name", "Companies", "Created", "Status"];
  const rows = users.map((u) => [
    u.id,
    u.email ?? "",
    u.name ?? "",
    u.companies.map((c) => c.companyName ?? c.companyId).join("; "),
    formatDate(u.createdAt),
    u.companies.some((c) => c.status === "active") ? "active" : "inactive",
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "admin-users.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function UserRow({ user, onDeactivate }: { user: AdminUser; onDeactivate: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = user.companies.some((c) => c.status === "active");

  return (
    <>
      <tr
        className="border-b border-border hover:bg-accent/30 transition-colors cursor-pointer"
        onClick={() => setExpanded((v) => !v)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm font-medium">{user.name ?? "—"}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">{user.email ?? "—"}</td>
        <td className="px-4 py-3 text-sm hidden sm:table-cell">
          {user.companies.length > 0 ? (
            <span className="text-muted-foreground">
              {user.companies
                .slice(0, 2)
                .map((c) => c.companyName ?? c.companyId.slice(0, 8))
                .join(", ")}
              {user.companies.length > 2 && (
                <span className="ml-1 text-xs text-muted-foreground/60">
                  +{user.companies.length - 2} more
                </span>
              )}
            </span>
          ) : (
            <span className="text-muted-foreground/50">None</span>
          )}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground hidden md:table-cell">
          {formatDate(user.createdAt)}
        </td>
        <td className="px-4 py-3">
          <span
            className={[
              "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
              isActive
                ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                : "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {isActive ? "active" : "inactive"}
          </span>
        </td>
        <td className="px-4 py-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeactivate(user.id);
            }}
            disabled={!isActive}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <UserX className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Deactivate</span>
          </button>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border bg-muted/20">
          <td colSpan={6} className="px-4 pb-4 pt-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Company Memberships
            </p>
            {user.companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">No company memberships.</p>
            ) : (
              <div className="space-y-1">
                {user.companies.map((c) => (
                  <div
                    key={c.companyId}
                    className="flex items-center gap-3 text-sm"
                  >
                    <span className="font-medium">{c.companyName ?? c.companyId.slice(0, 8)}</span>
                    <span className="text-muted-foreground">{c.membershipRole ?? "member"}</span>
                    <span
                      className={[
                        "rounded-full px-1.5 py-0.5 text-xs",
                        c.status === "active"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : "bg-muted text-muted-foreground",
                      ].join(" ")}
                    >
                      {c.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground/60 font-mono">ID: {user.id}</p>
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminUsers() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const LIMIT = 50;

  useEffect(() => {
    setBreadcrumbs([
      { label: "Enterprise Admin", href: "/admin" },
      { label: "Users" },
    ]);
  }, [setBreadcrumbs]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admin", "users", { search, page }],
    queryFn: () => adminApi.listUsers({ search, page, limit: LIMIT }),
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => adminApi.deactivateUser(userId),
    onSuccess: () => {
      pushToast({ title: "User deactivated", tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err) => {
      pushToast({
        title: "Failed to deactivate user",
        body: err instanceof Error ? err.message : undefined,
        tone: "error",
      });
    },
  });

  const totalPages = data ? Math.ceil(data.total / LIMIT) : 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0 max-w-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search users..."
              className="pl-9"
            />
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => data && exportCsv(data.users)}
          disabled={!data || data.users.length === 0}
          className="gap-1.5"
        >
          <Download className="h-4 w-4" />
          Export CSV
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : "Failed to load users"}
        </p>
      )}

      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-border bg-muted/30">
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Name</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Email</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden sm:table-cell">Companies</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide hidden md:table-cell">Created</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Status</th>
              <th className="px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  Loading users...
                </td>
              </tr>
            )}
            {!isLoading && data?.users.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No users found.
                </td>
              </tr>
            )}
            {data?.users.map((user) => (
              <UserRow
                key={user.id}
                user={user}
                onDeactivate={(id) => deactivateMutation.mutate(id)}
              />
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
            <span className="px-2">
              Page {page} of {totalPages}
            </span>
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
