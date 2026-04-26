import { useState, useCallback } from "react";

const STORAGE_KEY = "avero:sidebar:collapsed";

function readStored(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return false;
    return raw === "true";
  } catch {
    return false;
  }
}

function writeStored(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // localStorage may be unavailable in some environments; fail silently
  }
}

interface SidebarPreferences {
  collapsed: boolean;
  setCollapsed: (value: boolean) => void;
  toggle: () => void;
}

export function useSidebarPreferences(): SidebarPreferences {
  const [collapsed, setCollapsedState] = useState<boolean>(readStored);

  const setCollapsed = useCallback((value: boolean) => {
    writeStored(value);
    setCollapsedState(value);
  }, []);

  const toggle = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeStored(next);
      return next;
    });
  }, []);

  return { collapsed, setCollapsed, toggle };
}
