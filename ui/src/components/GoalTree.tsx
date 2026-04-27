import type { Goal } from "@paperclipai/shared";
import { Link } from "@/lib/router";
import { StatusBadge } from "./StatusBadge";
import { ChevronRight, Trash2 } from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { queryKeys } from "../lib/queryKeys";

interface GoalTreeProps {
  goals: Goal[];
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
  companyId?: string;
}

interface GoalNodeProps {
  goal: Goal;
  children: Goal[];
  allGoals: Goal[];
  depth: number;
  goalLink?: (goal: Goal) => string;
  onSelect?: (goal: Goal) => void;
  companyId?: string;
}

function countDescendants(goalId: string, allGoals: Goal[]): { total: number; achieved: number } {
  const direct = allGoals.filter((g) => g.parentId === goalId);
  if (direct.length === 0) return { total: 0, achieved: 0 };
  let total = direct.length;
  let achieved = direct.filter((g) => g.status === "achieved").length;
  for (const child of direct) {
    const sub = countDescendants(child.id, allGoals);
    total += sub.total;
    achieved += sub.achieved;
  }
  return { total, achieved };
}

function GoalNode({ goal, children, allGoals, depth, goalLink, onSelect, companyId }: GoalNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = children.length > 0;
  const link = goalLink?.(goal);
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => goalsApi.remove(goal.id),
    onSuccess: () => {
      if (companyId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.goals.list(companyId) });
      }
    },
  });

  function handleDelete(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm(`Delete goal "${goal.title}"? This cannot be undone.`)) return;
    deleteMutation.mutate();
  }

  const { total, achieved } = countDescendants(goal.id, allGoals);
  const showProgress = total > 0;
  const progressPct = showProgress ? Math.round((achieved / total) * 100) : null;

  const inner = (
    <>
      {hasChildren ? (
        <button
          className="p-0.5 shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          <ChevronRight
            className={cn("h-3 w-3 transition-transform", expanded && "rotate-90")}
          />
        </button>
      ) : (
        <span className="w-4 shrink-0" />
      )}
      <span className="text-xs text-muted-foreground capitalize shrink-0">{goal.level}</span>
      <span className="flex-1 truncate">{goal.title}</span>
      {showProgress && (
        <div className="hidden sm:flex items-center gap-1.5 shrink-0" title={`${achieved}/${total} sub-goals achieved`}>
          <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                progressPct === 100 ? "bg-green-500" : progressPct! >= 50 ? "bg-primary" : "bg-muted-foreground/40",
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground/70 w-7 text-right">
            {progressPct}%
          </span>
        </div>
      )}
      <StatusBadge status={goal.status} />
      <button
        className="shrink-0 ml-1 p-0.5 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover/row:opacity-100"
        onClick={handleDelete}
        title="Delete goal"
        aria-label="Delete goal"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </>
  );

  const classes = cn(
    "group/row flex items-center gap-2 px-3 py-1.5 text-sm transition-colors cursor-pointer hover:bg-accent/50",
  );

  return (
    <div>
      {link ? (
        <Link
          to={link}
          className={cn(classes, "no-underline text-inherit")}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
        >
          {inner}
        </Link>
      ) : (
        <div
          className={classes}
          style={{ paddingLeft: `${depth * 16 + 12}px` }}
          onClick={() => onSelect?.(goal)}
        >
          {inner}
        </div>
      )}
      {hasChildren && expanded && (
        <div>
          {children.map((child) => (
            <GoalNode
              key={child.id}
              goal={child}
              children={allGoals.filter((g) => g.parentId === child.id)}
              allGoals={allGoals}
              depth={depth + 1}
              goalLink={goalLink}
              onSelect={onSelect}
              companyId={companyId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function GoalTree({ goals, goalLink, onSelect, companyId }: GoalTreeProps) {
  const goalIds = new Set(goals.map((g) => g.id));
  const roots = goals.filter((g) => !g.parentId || !goalIds.has(g.parentId));

  if (goals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground px-3 py-4">No goals to display.</p>
    );
  }

  return (
    <div className="border border-border py-1">
      {roots.map((goal) => (
        <GoalNode
          key={goal.id}
          goal={goal}
          children={goals.filter((g) => g.parentId === goal.id)}
          allGoals={goals}
          depth={0}
          goalLink={goalLink}
          onSelect={onSelect}
          companyId={companyId}
        />
      ))}
    </div>
  );
}
