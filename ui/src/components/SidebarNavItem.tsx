import { NavLink } from "@/lib/router";
import { SIDEBAR_SCROLL_RESET_STATE } from "../lib/navigation-scroll";
import { cn } from "../lib/utils";
import { useSidebar } from "../context/SidebarContext";
import type { LucideIcon } from "lucide-react";
import { Star } from "lucide-react";

interface SidebarNavItemProps {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  className?: string;
  badge?: number;
  badgeTone?: "default" | "danger";
  textBadge?: string;
  textBadgeTone?: "default" | "amber";
  alert?: boolean;
  liveCount?: number;
  collapsed?: boolean;
  onFavoriteToggle?: () => void;
  isFavorite?: boolean;
}

export function SidebarNavItem({
  to,
  label,
  icon: Icon,
  end,
  className,
  badge,
  badgeTone = "default",
  textBadge,
  textBadgeTone = "default",
  alert = false,
  liveCount,
  collapsed = false,
  onFavoriteToggle,
  isFavorite,
}: SidebarNavItemProps) {
  const { isMobile, setSidebarOpen } = useSidebar();

  return (
    <NavLink
      to={to}
      state={SIDEBAR_SCROLL_RESET_STATE}
      end={end}
      title={collapsed ? label : undefined}
      onClick={() => { if (isMobile) setSidebarOpen(false); }}
      className={({ isActive }) =>
        cn(
          "group flex items-center gap-2.5 py-2 text-[13px] font-medium transition-colors border-l-2",
          collapsed ? "px-0 justify-center" : "pl-[10px] pr-3",
          isActive
            ? "bg-accent text-foreground border-l-primary"
            : "text-foreground/80 hover:bg-accent/50 hover:text-foreground border-l-transparent",
          className,
        )
      }
    >
      <span className="relative shrink-0">
        <Icon className="h-4 w-4" />
        {alert && (
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500 shadow-[0_0_0_2px_hsl(var(--background))]" />
        )}
      </span>
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{label}</span>
          {textBadge && (
            <span
              className={cn(
                "ml-auto rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
                textBadgeTone === "amber"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {textBadge}
            </span>
          )}
          {liveCount != null && liveCount > 0 && (
            <span className="ml-auto flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
              </span>
              <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400">{liveCount} live</span>
            </span>
          )}
          {badge != null && badge > 0 && (
            <span
              className={cn(
                "ml-auto rounded-full px-1.5 py-0.5 text-xs leading-none",
                badgeTone === "danger"
                  ? "bg-red-600/90 text-red-50"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {badge}
            </span>
          )}
          {onFavoriteToggle && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onFavoriteToggle();
              }}
              title={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground/50 hover:text-foreground p-0.5"
            >
              <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-primary text-primary")} />
            </button>
          )}
        </>
      )}
      {collapsed && badge != null && badge > 0 && (
        <span
          className={cn(
            "absolute top-1 right-1 h-2 w-2 rounded-full",
            badgeTone === "danger" ? "bg-red-500" : "bg-primary",
          )}
        />
      )}
    </NavLink>
  );
}
