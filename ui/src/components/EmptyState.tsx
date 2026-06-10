import { Plus } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: string;
  onAction?: () => void;
  actionIcon?: React.ReactNode;
  actionClassName?: string;
  role?: "status" | "alert" | "region";
}

export function EmptyState({ icon: Icon, message, action, onAction, actionIcon, actionClassName, role }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center" role={role ?? "status"}>
      <div className="bg-muted/50 p-4 mb-4 rounded-xl">
        <Icon className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
      </div>
      <p className="text-sm text-foreground/70 mb-4">{message}</p>
      {action && onAction && (
        <Button onClick={onAction} className={actionClassName}>
          {actionIcon !== undefined ? actionIcon : <Plus className="h-4 w-4 mr-1.5" aria-hidden="true" />}
          {action}
        </Button>
      )}
    </div>
  );
}
