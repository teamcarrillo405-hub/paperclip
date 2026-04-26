import { createContext, useCallback, useContext, useState, useEffect, type ReactNode } from "react";

const SECTION_COLLAPSED_KEY = "avero:sidebar:section-collapsed";
const FAVORITES_KEY = "avero:sidebar:favorites";

interface SidebarContextValue {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  toggleSidebar: () => void;
  isMobile: boolean;
  sectionCollapsed: Set<string>;
  toggleSectionCollapsed: (label: string) => void;
  favoritePaths: string[];
  toggleFavorite: (path: string) => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const MOBILE_BREAKPOINT = 768;

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < MOBILE_BREAKPOINT);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= MOBILE_BREAKPOINT);

  const [sectionCollapsed, setSectionCollapsed] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(SECTION_COLLAPSED_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch { return new Set(); }
  });

  const [favoritePaths, setFavoritePaths] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
    } catch { return []; }
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      setSidebarOpen(!e.matches);
    };
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const toggleSidebar = useCallback(() => setSidebarOpen((v) => !v), []);

  const toggleSectionCollapsed = useCallback((label: string) => {
    setSectionCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      try { localStorage.setItem(SECTION_COLLAPSED_KEY, JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((path: string) => {
    setFavoritePaths((prev) => {
      const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
      try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  return (
    <SidebarContext.Provider value={{
      sidebarOpen,
      setSidebarOpen,
      toggleSidebar,
      isMobile,
      sectionCollapsed,
      toggleSectionCollapsed,
      favoritePaths,
      toggleFavorite,
    }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) {
    throw new Error("useSidebar must be used within SidebarProvider");
  }
  return ctx;
}
