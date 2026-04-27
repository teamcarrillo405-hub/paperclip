import { useEffect } from "react";
import { cn } from "../lib/utils";
import {
  Inbox,
  CircleDot,
  Target,
  LayoutDashboard,
  DollarSign,
  History,
  Search,
  SquarePen,
  TrendingUp,
  Network,
  Boxes,
  Repeat,
  GitBranch,
  GraduationCap,
  Settings,
  ShieldCheck,
  Users,
  Share2,
  Handshake,
  Megaphone,
  Wrench,
  Bot,
  BookOpen,
  Mail,
  Video,
  Image,
  Terminal,
  Shield,
  Presentation,
  FileInput,
  Mic,
  BarChart2,
  PanelLeftClose,
  PanelLeftOpen,
  ClipboardCheck,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@/lib/router";
import { resellerApi } from "../api/reseller";
import { accessApi } from "../api/access";
import { authApi } from "../api/auth";
import { healthApi } from "../api/health";
import { SidebarSection } from "./SidebarSection";
import { SidebarNavItem } from "./SidebarNavItem";
import { SidebarProjects } from "./SidebarProjects";
import { SidebarAgents } from "./SidebarAgents";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { heartbeatsApi } from "../api/heartbeats";
import { instanceSettingsApi } from "../api/instanceSettings";
import { sidebarBadgesApi } from "../api/sidebarBadges";
import { queryKeys } from "../lib/queryKeys";
import { useInboxBadge } from "../hooks/useInboxBadge";
import { useSidebarPreferences } from "../hooks/useSidebarPreferences";
import { useSidebar } from "../context/SidebarContext";
import { Button } from "@/components/ui/button";
import { PluginSlotOutlet } from "@/plugins/slots";
import { SidebarCompanyMenu } from "./SidebarCompanyMenu";
import { DensityToggle } from "./DensityToggle";

const ALL_NAV_ITEMS = [
  { to: "/issues", label: "Issues", icon: CircleDot },
  { to: "/inbox", label: "Inbox", icon: Inbox },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck },
  { to: "/autonomous-tasks", label: "Autonomous Tasks", icon: Bot },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/routines", label: "Routines", icon: Repeat },
  { to: "/activity", label: "Activity", icon: History },
  { to: "/costs", label: "Costs", icon: DollarSign },
  { to: "/compliance", label: "Compliance", icon: ShieldCheck },
] as const;

export function Sidebar() {
  const { openNewIssue } = useDialog();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const inboxBadge = useInboxBadge(selectedCompanyId);
  const { collapsed, toggle } = useSidebarPreferences();

  useEffect(() => {
    function handleGlobalKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      )
        return;
      if (e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        toggle();
      }
    }
    document.addEventListener("keydown", handleGlobalKey);
    return () => document.removeEventListener("keydown", handleGlobalKey);
  }, [toggle]);

  const { sectionCollapsed, toggleSectionCollapsed, favoritePaths, toggleFavorite } = useSidebar();

  const { data: experimentalSettings } = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(selectedCompanyId!),
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 10_000,
  });
  const liveRunCount = liveRuns?.length ?? 0;

  const { data: sidebarBadges } = useQuery({
    queryKey: queryKeys.sidebarBadges(selectedCompanyId!),
    queryFn: () => sidebarBadgesApi.get(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });
  const approvalsBadgeCount = sidebarBadges?.approvals ?? 0;

  const showWorkspacesLink = experimentalSettings?.enableIsolatedWorkspaces === true;

  const location = useLocation();
  const isOnPartnerRoute = location.pathname.startsWith("/partner");
  const { data: resellerMe } = useQuery({
    queryKey: ["reseller", "me"],
    queryFn: () => resellerApi.me(),
    staleTime: 5 * 60_000,
    retry: false,
  });
  const showPartnerLink = Boolean(resellerMe?.partner) || isOnPartnerRoute;

  const { data: healthData } = useQuery({
    queryKey: queryKeys.health,
    queryFn: () => healthApi.get(),
    retry: false,
    staleTime: 30_000,
  });
  const isAuthenticatedMode = healthData?.deploymentMode === "authenticated";
  const { data: sessionData } = useQuery({
    queryKey: queryKeys.auth.session,
    queryFn: () => authApi.getSession(),
    enabled: isAuthenticatedMode,
    retry: false,
    staleTime: 60_000,
  });
  const { data: boardAccess } = useQuery({
    queryKey: queryKeys.access.currentBoardAccess,
    queryFn: () => accessApi.getCurrentBoardAccess(),
    enabled: isAuthenticatedMode && !!sessionData,
    retry: false,
    staleTime: 60_000,
  });
  const showAdminLink = !isAuthenticatedMode || boardAccess?.isInstanceAdmin === true;

  function openSearch() {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }));
  }

  const pluginContext = {
    companyId: selectedCompanyId,
    companyPrefix: selectedCompany?.issuePrefix ?? null,
  };

  const ToggleIcon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      className="h-full min-h-0 border-r border-border bg-background flex flex-col transition-all duration-200 ease-in-out overflow-hidden"
      style={{ width: collapsed ? "64px" : "240px" }}
    >
      {/* AVERO logo */}
      <div
        className={
          collapsed
            ? "flex items-center justify-center px-2 pt-4 pb-2 shrink-0"
            : "flex items-center justify-center px-4 pt-4 pb-2 shrink-0"
        }
      >
        {collapsed ? (
          /* Show a small mark when collapsed — use first letter of branding */
          <div className="h-8 w-8 flex items-center justify-center">
            <img src="/branding/logo.png" alt="AVERO" className="h-6 w-auto object-contain" />
          </div>
        ) : (
          <img src="/branding/logo.png" alt="AVERO" className="h-8 w-auto" />
        )}
      </div>

      {/* Top bar: Company menu + Search */}
      <div className={cn("flex items-center h-12 shrink-0", collapsed ? "justify-center" : "gap-1 px-3")}>
        <div
          className={cn(
            "transition-all duration-150 overflow-hidden",
            collapsed ? "opacity-0 max-w-0" : "opacity-100 flex-1 min-w-0",
          )}
        >
          <SidebarCompanyMenu />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={openSearch}
          title="Search"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto scrollbar-auto-hide flex flex-col gap-4 px-2 py-2">

        {/* Favorites section — shown when at least one item is pinned */}
        {favoritePaths.length > 0 && (
          <div className="mb-1">
            <div className="px-3 py-1.5">
              <span
                className={cn(
                  "block text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60 transition-all duration-150",
                  collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100",
                )}
              >
                Favorites
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              {favoritePaths.map((path) => {
                const item = ALL_NAV_ITEMS.find((n) => n.to === path);
                if (!item) return null;
                return (
                  <SidebarNavItem
                    key={path}
                    to={item.to}
                    label={item.label}
                    icon={item.icon}
                    collapsed={collapsed}
                    isFavorite
                    onFavoriteToggle={() => toggleFavorite(path)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Workspace section: core navigation */}
        <div className="flex flex-col gap-0.5">
          <div className="px-3 py-1.5">
            {/* Divider shown only when collapsed */}
            <div
              className={cn(
                "h-px w-full bg-border/50 transition-all duration-150",
                collapsed ? "opacity-100" : "opacity-0 max-w-0 overflow-hidden",
              )}
            />
            {/* Label shown only when expanded */}
            <span
              className={cn(
                "block text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60 transition-all duration-150",
                collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100",
              )}
            >
              Workspace
            </span>
          </div>
          {/* New Issue button */}
          <button
            onClick={() => openNewIssue()}
            title={collapsed ? "New Issue" : undefined}
            className={
              collapsed
                ? "flex items-center justify-center py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                : "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            }
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span
              className={cn(
                "truncate transition-all duration-150",
                collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-[200px]",
              )}
            >
              New Issue
            </span>
          </button>
          <SidebarNavItem
            to="/dashboard"
            label="Dashboard"
            icon={LayoutDashboard}
            liveCount={liveRunCount}
            collapsed={collapsed}
          />
          <SidebarNavItem to="/roi" label="ROI Dashboard" icon={TrendingUp} collapsed={collapsed} />
          <SidebarNavItem to="/financial-health" label="Financial Health" icon={DollarSign} collapsed={collapsed} />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/inbox")}
            isFavorite={favoritePaths.includes("/inbox")}
          />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        {/* Work section */}
        <SidebarSection
          label="Work"
          collapsed={collapsed}
          collapsible
          isCollapsed={sectionCollapsed.has("Work")}
          onToggleCollapse={() => toggleSectionCollapsed("Work")}
          createHref="/issues?new=1"
          createTitle="New issue"
        >
          <SidebarNavItem
            to="/issues"
            label="Issues"
            icon={CircleDot}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/issues")}
            isFavorite={favoritePaths.includes("/issues")}
          />
          <SidebarNavItem
            to="/approvals"
            label="Approvals"
            icon={ClipboardCheck}
            badge={!collapsed ? approvalsBadgeCount : undefined}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/approvals")}
            isFavorite={favoritePaths.includes("/approvals")}
          />
          <SidebarNavItem
            to="/routines"
            label="Routines"
            icon={Repeat}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/routines")}
            isFavorite={favoritePaths.includes("/routines")}
          />
          <SidebarNavItem
            to="/goals"
            label="Goals"
            icon={Target}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/goals")}
            isFavorite={favoritePaths.includes("/goals")}
          />
          <SidebarNavItem to="/customers" label="Customers" icon={Users} collapsed={collapsed} />
          <SidebarNavItem to="/social" label="Social Media" icon={Share2} collapsed={collapsed} />
          <SidebarNavItem to="/marketing" label="Marketing" icon={Megaphone} collapsed={collapsed} />
          <SidebarNavItem to="/crews" label="AI Crews" icon={Users} collapsed={collapsed} />
          <SidebarNavItem to="/knowledge" label="Knowledge Base" icon={BookOpen} collapsed={collapsed} />
          <SidebarNavItem to="/email" label="Email" icon={Mail} collapsed={collapsed} />
          <SidebarNavItem to="/video-studio" label="Video Studio" icon={Video} collapsed={collapsed} />
          <SidebarNavItem to="/image-studio" label="Image Studio" icon={Image} collapsed={collapsed} />
          <SidebarNavItem to="/slides" label="Presentations" icon={Presentation} collapsed={collapsed} />
          <SidebarNavItem to="/form-builder" label="Form Builder" icon={FileInput} collapsed={collapsed} />
          <SidebarNavItem to="/automations" label="Automations" icon={GitBranch} collapsed={collapsed} />
          <SidebarNavItem
            to="/autonomous-tasks"
            label="Autonomous Tasks"
            icon={Bot}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/autonomous-tasks")}
            isFavorite={favoritePaths.includes("/autonomous-tasks")}
          />
          <SidebarNavItem to="/live-meeting" label="Live Meeting" icon={Mic} collapsed={collapsed} />
          {showWorkspacesLink ? (
            <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} collapsed={collapsed} />
          ) : null}
        </SidebarSection>

        <SidebarProjects />

        <SidebarAgents />

        {/* Insights section */}
        <SidebarSection
          label="Insights"
          collapsed={collapsed}
          collapsible
          isCollapsed={sectionCollapsed.has("Insights")}
          onToggleCollapse={() => toggleSectionCollapsed("Insights")}
        >
          <SidebarNavItem to="/reports" label="Reports" icon={BarChart2} collapsed={collapsed} />
          <SidebarNavItem
            to="/costs"
            label="Costs"
            icon={DollarSign}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/costs")}
            isFavorite={favoritePaths.includes("/costs")}
          />
          <SidebarNavItem
            to="/activity"
            label="Activity"
            icon={History}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/activity")}
            isFavorite={favoritePaths.includes("/activity")}
          />
        </SidebarSection>

        {/* Company section */}
        <SidebarSection
          label="Company"
          collapsed={collapsed}
          collapsible
          isCollapsed={sectionCollapsed.has("Company")}
          onToggleCollapse={() => toggleSectionCollapsed("Company")}
        >
          <SidebarNavItem to="/org" label="Org" icon={Network} collapsed={collapsed} />
          <SidebarNavItem to="/skills" label="Skills" icon={Boxes} collapsed={collapsed} />
          <SidebarNavItem
            to="/compliance"
            label="Compliance"
            icon={ShieldCheck}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite("/compliance")}
            isFavorite={favoritePaths.includes("/compliance")}
          />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} collapsed={collapsed} />
          <SidebarNavItem to="/onboarding" label="Setup Guide" icon={GraduationCap} collapsed={collapsed} />
          {showPartnerLink ? (
            <SidebarNavItem to="/partner" label="Partner Program" icon={Handshake} collapsed={collapsed} />
          ) : null}
          {import.meta.env.VITE_DEV_MODE === "true" ? (
            <SidebarNavItem to="/dev-tools" label="Dev Tools" icon={Terminal} collapsed={collapsed} />
          ) : null}
          {showAdminLink ? (
            <SidebarNavItem to="/admin" label="Enterprise Admin" icon={Shield} collapsed={collapsed} />
          ) : null}
        </SidebarSection>

        <PluginSlotOutlet
          slotTypes={["sidebarPanel"]}
          context={pluginContext}
          className="flex flex-col gap-3"
          itemClassName="rounded-lg border border-border p-3"
          missingBehavior="placeholder"
        />
      </nav>

      {/* Bottom bar: density toggle + collapse button */}
      <div className="shrink-0 border-t border-border px-2 py-2 flex flex-col gap-1">
        <div
          className={cn(
            "flex items-center justify-between px-3 py-1 transition-all duration-150",
            collapsed ? "opacity-0 max-h-0 overflow-hidden py-0" : "opacity-100 max-h-[40px]",
          )}
        >
          <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
            Density
          </span>
          <DensityToggle collapsed={collapsed} />
        </div>
        <button
          onClick={toggle}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "w-full flex items-center py-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
            collapsed ? "justify-center" : "gap-2.5 px-3 text-[13px]",
          )}
        >
          <ToggleIcon className="h-4 w-4 shrink-0" />
          <span
            className={cn(
              "text-[12px] font-medium transition-all duration-150",
              collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-[200px]",
            )}
          >
            Collapse
          </span>
        </button>
      </div>
    </aside>
  );
}
