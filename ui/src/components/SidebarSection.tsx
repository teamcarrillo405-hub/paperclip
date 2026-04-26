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
      {!collapsed && (
        <div
          className={cn(
            "group/sec flex items-center justify-between px-3 py-1.5",
            collapsible && "cursor-pointer select-none",
          )}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          <span className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
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
              className="opacity-0 group-hover/sec:opacity-100 transition-opacity text-muted-foreground/60 hover:text-foreground rounded"
            >
              <Plus className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      )}
      {collapsed && (
        <div className="py-1 px-2">
          <div className="h-px w-full bg-border/50" />
        </div>
      )}
      {!isCollapsed && (
        <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>
      )}
    </div>
  );
}
