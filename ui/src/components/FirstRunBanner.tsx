import { X } from "lucide-react";
import { useState, useEffect } from "react";

interface FirstRunBannerProps {
  storageKey: string;      // localStorage key
  title: string;
  description: string;
}

export function FirstRunBanner({ storageKey, title, description }: FirstRunBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    return localStorage.getItem(storageKey) === "dismissed";
  });

  if (dismissed) return null;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-accent/30 px-4 py-3 mb-4">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => {
          localStorage.setItem(storageKey, "dismissed");
          setDismissed(true);
        }}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
