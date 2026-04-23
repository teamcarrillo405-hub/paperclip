import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type BrandConfig = {
  productName: string;
  productTagline: string;
  supportEmail: string;
  docsUrl: string;
  primaryColor: string;
  accentColor: string;
  faviconPath: string;
  logoPath: string;
  companyName: string;
  hideOpenSourceBranding: boolean;
};

export const DEFAULT_BRAND: BrandConfig = {
  productName: "Paperclip",
  productTagline: "AI-powered agent orchestration",
  supportEmail: "",
  docsUrl: "",
  primaryColor: "",
  accentColor: "",
  faviconPath: "",
  logoPath: "",
  companyName: "",
  hideOpenSourceBranding: false,
};

export const BrandContext = createContext<BrandConfig>(DEFAULT_BRAND);

export function BrandProvider({ children }: { children: ReactNode }) {
  const [brand, setBrand] = useState<BrandConfig>(DEFAULT_BRAND);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/brand", { credentials: "same-origin" });
        if (!res.ok) return;
        const data = (await res.json()) as Partial<BrandConfig>;
        if (cancelled) return;
        setBrand({ ...DEFAULT_BRAND, ...data });
      } catch {
        // Leave defaults in place if the brand endpoint is unreachable.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => brand, [brand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
