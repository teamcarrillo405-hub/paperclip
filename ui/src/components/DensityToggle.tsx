import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type Density = "compact" | "default" | "comfortable";

const STORAGE_KEY = "avero:density";
const DENSITIES: { value: Density; label: string; abbr: string }[] = [
  { value: "compact", label: "Compact", abbr: "C" },
  { value: "default", label: "Default", abbr: "D" },
  { value: "comfortable", label: "Comfortable", abbr: "W" },
];

function readStored(): Density {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "compact" || raw === "default" || raw === "comfortable") {
      return raw;
    }
  } catch {
    // localStorage unavailable — fall through
  }
  return "default";
}

function writeStored(value: Density): void {
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Fail silently
  }
}

function applyDensity(value: Density): void {
  document.documentElement.dataset["density"] = value;
}

export function useDensity(): { density: Density; setDensity: (d: Density) => void } {
  const [density, setDensityState] = useState<Density>(readStored);

  useEffect(() => {
    applyDensity(density);
  }, [density]);

  const setDensity = useCallback((d: Density) => {
    writeStored(d);
    applyDensity(d);
    setDensityState(d);
  }, []);

  return { density, setDensity };
}

interface DensityToggleProps {
  /** When true, render icon-only (single-letter abbr) compact variant */
  collapsed?: boolean;
}

export function DensityToggle({ collapsed = false }: DensityToggleProps) {
  const { density, setDensity } = useDensity();

  return (
    <div
      className="flex items-center gap-px rounded border border-border bg-muted p-0.5"
      role="radiogroup"
      aria-label="UI density"
    >
      {DENSITIES.map(({ value, label, abbr }) => {
        const isActive = density === value;
        return (
          <button
            key={value}
            type="button"
            onClick={() => setDensity(value)}
            title={label}
            role="radio"
            aria-checked={isActive}
            className={cn(
              "flex h-5 items-center justify-center rounded-sm font-mono text-xs font-medium leading-none transition-colors",
              collapsed ? "w-5" : "px-1.5",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
            )}
          >
            {collapsed ? abbr : abbr}
          </button>
        );
      })}
    </div>
  );
}
