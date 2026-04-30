import type { ReactNode } from "react";
import { ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/lib/router";

interface SidebarSectionProps {
  label: string;
  children: ReactNode;
  collapsed?: boolean;
  collapsible?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  createHref?: string;
  createTitle?: string;
}

export function SidebarSection({
  label,
  children,
  collapsed = false,
  collapsible = false,
  isCollapsed = false,
  onToggleCollapse,
  createHref,
  createTitle,
}: SidebarSectionProps) {
  return (
    <div>
      {/* Section header: fades label in/out; shows a divider line when collapsed */}
      <div
        className={cn(
          "group/sec flex items-center justify-between px-3 py-1.5",
          collapsible && !collapsed && "cursor-pointer select-none",
        )}
        onClick={!collapsed && collapsible ? onToggleCollapse : undefined}
      >
        {/* Divider: full-opacity when collapsed (replaces label), subtle when expanded */}
        <div
          className={cn(
            "h-px bg-border/50 transition-all duration-150",
            collapsed ? "opacity-100 w-full" : "opacity-20 w-full",
          )}
        />
        {/* Label row — fades in when expanded */}
        <span
          className={cn(
            "flex items-center gap-1 text-xs font-medium uppercase tracking-widest font-mono text-muted-foreground/60 transition-all duration-150",
            collapsed ? "opacity-0 max-w-0 overflow-hidden" : "opacity-100",
          )}
        >
          {collapsible && (
            <ChevronRight
              className={cn(
                "h-3 w-3 transition-transform duration-150",
                !isCollapsed && "rotate-90",
              )}
            />
          )}
          {label}
        </span>
        {createHref && (
          <Link
            to={createHref}
            onClick={(e) => e.stopPropagation()}
            title={createTitle ?? `New ${label.toLowerCase()}`}
            className={cn(
              "opacity-0 group-hover/sec:opacity-100 transition-opacity text-muted-foreground/60 hover:text-foreground rounded",
              collapsed && "pointer-events-none",
            )}
          >
            <Plus className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {!isCollapsed && (
        <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>
      )}
    </div>
  );
}
