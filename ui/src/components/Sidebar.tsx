import { useEffect, useState } from "react";
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
  Puzzle,
  Plug,
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
  const [hoverExpanded, setHoverExpanded] = useState(false);
  const effectiveCollapsed = collapsed && !hoverExpanded;

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

  const ToggleIcon = effectiveCollapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <aside
      onMouseEnter={() => { if (collapsed) setHoverExpanded(true); }}
      onMouseLeave={() => setHoverExpanded(false)}
      className="h-full min-h-0 border-r border-border bg-background flex flex-col transition-all duration-200 ease-in-out overflow-hidden"
      style={{ width: effectiveCollapsed ? "64px" : "240px" }}
    >
      {/* AVERO logo */}
      <div
        className={
          effectiveCollapsed
            ? "flex items-center justify-center px-2 pt-4 pb-2 shrink-0"
            : "flex items-center justify-center px-4 pt-4 pb-2 shrink-0"
        }
      >
        {effectiveCollapsed ? (
          /* Show a small mark when collapsed — use first letter of branding */
          <div className="h-8 w-8 flex items-center justify-center">
            <img src="/branding/logo.png" alt="AVERO" className="h-6 w-auto object-contain" />
          </div>
        ) : (
          <img src="/branding/logo.png" alt="AVERO" className="h-8 w-auto" />
        )}
      </div>

      {/* Top bar: Company menu + Search */}
      <div className={cn("flex items-center h-12 shrink-0", effectiveCollapsed ? "justify-center" : "gap-1 px-3")}>
        <div
          className={cn(
            "transition-all duration-150 overflow-hidden",
            effectiveCollapsed ? "opacity-0 max-w-0" : "opacity-100 flex-1 min-w-0",
          )}
        >
          <SidebarCompanyMenu />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground shrink-0"
          onClick={openSearch}
          title="Search (⌘K)"
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
                  "flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60 transition-all duration-150",
                  effectiveCollapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100",
                )}
              >
                Favorites
                <span className="px-1 py-0.5 rounded bg-muted text-muted-foreground/60 text-[9px] font-semibold tabular-nums leading-none">
                  {favoritePaths.length}
                </span>
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
                    collapsed={effectiveCollapsed}
                    isFavorite
                    onFavoriteToggle={() => toggleFavorite(path)}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Primary nav — always visible, no section label */}
        <div className="flex flex-col gap-0.5">
          {/* New Issue button */}
          <button
            onClick={() => openNewIssue()}
            title={effectiveCollapsed ? "New Issue" : undefined}
            className={
              effectiveCollapsed
                ? "flex items-center justify-center py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
                : "flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-muted-foreground hover:bg-accent/50 hover:text-foreground transition-colors"
            }
          >
            <SquarePen className="h-4 w-4 shrink-0" />
            <span
              className={cn(
                "truncate transition-all duration-150",
                effectiveCollapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-[200px]",
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
            collapsed={effectiveCollapsed}
          />
          <SidebarNavItem
            to="/inbox"
            label="Inbox"
            icon={Inbox}
            badge={inboxBadge.inbox}
            badgeTone={inboxBadge.failedRuns > 0 ? "danger" : "default"}
            alert={inboxBadge.failedRuns > 0}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/inbox")}
            isFavorite={favoritePaths.includes("/inbox")}
          />
          <SidebarNavItem
            to="/issues"
            label="Issues"
            icon={CircleDot}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/issues")}
            isFavorite={favoritePaths.includes("/issues")}
          />
          <SidebarNavItem
            to="/approvals"
            label="Approvals"
            icon={ClipboardCheck}
            badge={approvalsBadgeCount}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/approvals")}
            isFavorite={favoritePaths.includes("/approvals")}
          />
          <SidebarNavItem
            to="/costs"
            label="Costs"
            icon={DollarSign}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/costs")}
            isFavorite={favoritePaths.includes("/costs")}
          />
          <SidebarNavItem
            to="/activity"
            label="Activity"
            icon={History}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/activity")}
            isFavorite={favoritePaths.includes("/activity")}
          />
          <PluginSlotOutlet
            slotTypes={["sidebar"]}
            context={pluginContext}
            className="flex flex-col gap-0.5"
            itemClassName="text-[13px] font-medium"
            missingBehavior="placeholder"
          />
        </div>

        <SidebarProjects />

        <SidebarAgents />

        {/* Tools section — collapsible, defaults closed (key "Tools__open" absent = collapsed) */}
        <SidebarSection
          label="Tools"
          collapsed={effectiveCollapsed}
          collapsible
          isCollapsed={!sectionCollapsed.has("Tools__open")}
          onToggleCollapse={() => toggleSectionCollapsed("Tools__open")}
        >
          <SidebarNavItem
            to="/routines"
            label="Routines"
            icon={Repeat}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/routines")}
            isFavorite={favoritePaths.includes("/routines")}
          />
          <SidebarNavItem
            to="/goals"
            label="Goals"
            icon={Target}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/goals")}
            isFavorite={favoritePaths.includes("/goals")}
          />
          <SidebarNavItem
            to="/autonomous-tasks"
            label="Autonomous Tasks"
            icon={Bot}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/autonomous-tasks")}
            isFavorite={favoritePaths.includes("/autonomous-tasks")}
          />
          <SidebarNavItem to="/customers" label="Customers" icon={Users} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/social" label="Social Media" icon={Share2} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/marketing" label="Marketing" icon={Megaphone} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/crews" label="AI Crews" icon={Users} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/knowledge" label="Knowledge Base" icon={BookOpen} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/email" label="Email" icon={Mail} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/video-studio" label="Video Studio" icon={Video} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/image-studio" label="Image Studio" icon={Image} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/slides" label="Presentations" icon={Presentation} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/form-builder" label="Form Builder" icon={FileInput} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/automations" label="Automations" icon={GitBranch} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/live-meeting" label="Live Meeting" icon={Mic} collapsed={effectiveCollapsed} />
          {showWorkspacesLink ? (
            <SidebarNavItem to="/workspaces" label="Workspaces" icon={GitBranch} collapsed={effectiveCollapsed} />
          ) : null}
        </SidebarSection>

        {/* Insights section */}
        <SidebarSection
          label="Insights"
          collapsed={effectiveCollapsed}
          collapsible
          isCollapsed={sectionCollapsed.has("Insights")}
          onToggleCollapse={() => toggleSectionCollapsed("Insights")}
        >
          <SidebarNavItem to="/roi" label="ROI Dashboard" icon={TrendingUp} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/financial-health" label="Financial Health" icon={DollarSign} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/reports" label="Reports" icon={BarChart2} collapsed={effectiveCollapsed} />
        </SidebarSection>

        {/* Company section */}
        <SidebarSection
          label="Company"
          collapsed={effectiveCollapsed}
          collapsible
          isCollapsed={sectionCollapsed.has("Company")}
          onToggleCollapse={() => toggleSectionCollapsed("Company")}
        >
          <SidebarNavItem to="/org" label="Org" icon={Network} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/skills" label="Skills" icon={Boxes} collapsed={effectiveCollapsed} />
          <SidebarNavItem
            to="/compliance"
            label="Compliance"
            icon={ShieldCheck}
            collapsed={effectiveCollapsed}
            onFavoriteToggle={() => toggleFavorite("/compliance")}
            isFavorite={favoritePaths.includes("/compliance")}
          />
          <SidebarNavItem to="/integrations" label="Integrations" icon={Plug} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/instance/settings/plugins" label="Plugins" icon={Puzzle} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/company/settings" label="Settings" icon={Settings} collapsed={effectiveCollapsed} />
          <SidebarNavItem to="/onboarding" label="Setup Guide" icon={GraduationCap} collapsed={effectiveCollapsed} />
          {showPartnerLink ? (
            <SidebarNavItem to="/partner" label="Partner Program" icon={Handshake} collapsed={effectiveCollapsed} />
          ) : null}
          {import.meta.env.VITE_DEV_MODE === "true" ? (
            <SidebarNavItem to="/dev-tools" label="Dev Tools" icon={Terminal} collapsed={effectiveCollapsed} />
          ) : null}
          {showAdminLink ? (
            <SidebarNavItem to="/admin" label="Enterprise Admin" icon={Shield} collapsed={effectiveCollapsed} />
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

      {/* Bottom bar: user identity + density toggle + collapse button */}
      <div className="shrink-0 border-t border-border px-2 py-2 flex flex-col gap-1">
        {isAuthenticatedMode && sessionData && (
          <div
            className={cn(
              "flex items-center px-2 py-1.5 rounded-md hover:bg-accent/40 transition-colors cursor-default",
              effectiveCollapsed ? "justify-center" : "gap-2.5",
            )}
            title={effectiveCollapsed ? (sessionData.user.name ?? sessionData.user.email ?? "") : undefined}
          >
            {sessionData.user.image ? (
              <img
                src={sessionData.user.image}
                alt={sessionData.user.name ?? "User"}
                className="h-6 w-6 rounded-full shrink-0 object-cover"
              />
            ) : (
              <span className="h-6 w-6 rounded-full shrink-0 flex items-center justify-center bg-primary/10 text-primary text-[10px] font-semibold uppercase">
                {(sessionData.user.name ?? sessionData.user.email ?? "?").charAt(0)}
              </span>
            )}
            <div
              className={cn(
                "min-w-0 transition-all duration-150",
                effectiveCollapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-[180px]",
              )}
            >
              <p className="text-[12px] font-medium truncate leading-tight">{sessionData.user.name ?? "User"}</p>
              {sessionData.user.email && (
                <p className="text-[10px] text-muted-foreground/70 truncate leading-tight">{sessionData.user.email}</p>
              )}
            </div>
          </div>
        )}
        <div
          className={cn(
            "flex items-center justify-between px-3 py-1 transition-all duration-150",
            effectiveCollapsed ? "opacity-0 max-h-0 overflow-hidden py-0 pointer-events-none" : "opacity-100 max-h-10",
          )}
        >
          <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
            Density
          </span>
          <DensityToggle collapsed={effectiveCollapsed} />
        </div>
        <button
          onClick={toggle}
          title={effectiveCollapsed ? "Expand sidebar ([ key)" : "Collapse sidebar ([ key)"}
          className={cn(
            "w-full flex items-center py-2 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors",
            effectiveCollapsed ? "justify-center" : "gap-2.5 px-3 text-[13px]",
          )}
        >
          <ToggleIcon className="h-4 w-4 shrink-0" />
          <span
            className={cn(
              "text-[12px] font-medium transition-all duration-150",
              effectiveCollapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100 max-w-[200px]",
            )}
          >
            Collapse
          </span>
        </button>
      </div>
    </aside>
  );
}
