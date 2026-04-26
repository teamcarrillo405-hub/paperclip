import { useEffect } from "react";
import { Outlet, useLocation } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import { Shield, LayoutDashboard, Users, BarChart2, BookLock, ScrollText, Server, Phone } from "lucide-react";
import { accessApi } from "@/api/access";
import { authApi } from "@/api/auth";
import { healthApi } from "@/api/health";
import { queryKeys } from "@/lib/queryKeys";
import { SidebarNavItem } from "@/components/SidebarNavItem";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";

const NAV_ITEMS = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/admin/users", label: "Users", icon: Users },
  { to: "/admin/usage", label: "Usage", icon: BarChart2 },
  { to: "/admin/model-policies", label: "Model Policies", icon: BookLock },
  { to: "/admin/audit-log", label: "Audit Log", icon: ScrollText },
  { to: "/admin/system", label: "System", icon: Server },
  { to: "/admin/voice", label: "Voice Agent", icon: Phone },
  { to: "/reports", label: "Reports", icon: BarChart2 },
];

const SECTION_LABELS: Record<string, string> = {
  "/admin": "Overview",
  "/admin/users": "Users",
  "/admin/usage": "Usage",
  "/admin/model-policies": "Model Policies",
  "/admin/audit-log": "Audit Log",
  "/admin/system": "System",
  "/admin/voice": "Voice Agent",
};

export function AdminLayout() {
  const location = useLocation();
  const { setBreadcrumbs } = useBreadcrumbs();

  const healthQuery = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
  });

  const isAuthenticatedMode = healthQuery.data?.deploymentMode === "authenticated";

  const sessionQuery = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
  });

  const boardAccessQuery = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    enabled: isAuthenticatedMode && !!sessionQuery.data,
    retry: false,
  });

  const isInstanceAdmin =
    !isAuthenticatedMode || boardAccessQuery.data?.isInstanceAdmin === true;

  const currentSection =
    SECTION_LABELS[location.pathname] ??
    Object.entries(SECTION_LABELS)
      .reverse()
      .find(([path]) => location.pathname.startsWith(path))?.[1] ??
    "Admin";

  useEffect(() => {
    setBreadcrumbs([
      { label: "Enterprise Admin", href: "/admin" },
      ...(currentSection !== "Overview" ? [{ label: currentSection }] : []),
    ]);
  }, [setBreadcrumbs, currentSection]);

  return (
    <div className="flex h-full min-h-0 -m-4 md:-m-6">
      {/* Left sidebar */}
      <aside className="w-56 shrink-0 border-r border-border bg-background flex flex-col hidden md:flex">
        <div className="flex items-center gap-2 px-3 h-12 shrink-0 border-b border-border">
          <Shield className="h-4 w-4 text-primary shrink-0 ml-1" />
          <span className="text-sm font-bold text-foreground truncate">Enterprise Admin</span>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-0.5 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.to}
              to={item.to}
              label={item.label}
              icon={item.icon}
              end={item.end}
            />
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col overflow-auto">
        {/* Mobile nav */}
        <div className="flex md:hidden gap-1 overflow-x-auto px-4 py-2 border-b border-border bg-background shrink-0">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <a
                key={item.to}
                href={item.to}
                className={[
                  "flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium rounded-md shrink-0 transition-colors",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {item.label}
              </a>
            );
          })}
        </div>

        {/* Warning banner for non-admins */}
        {isAuthenticatedMode && boardAccessQuery.data && !isInstanceAdmin && (
          <div className="mx-4 mt-4 md:mx-6 flex items-center gap-2.5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-950/60">
            <Shield className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <p className="text-sm text-amber-900 dark:text-amber-100">
              You do not have instance admin access. Some data may not be visible.
            </p>
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 p-4 md:p-6">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
