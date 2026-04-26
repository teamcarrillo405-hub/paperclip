import { useCallback, useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

interface UsePwaInstallResult {
  canInstall: boolean;
  install: () => Promise<void>;
}

export function usePwaInstall(): UsePwaInstallResult {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };

    window.addEventListener("beforeinstallprompt", handler);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
    };
  }, []);

  const install = useCallback(async () => {
    if (!promptRef.current) return;

    await promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;

    if (outcome === "accepted") {
      promptRef.current = null;
      setCanInstall(false);
    }
  }, []);

  return { canInstall, install };
}
