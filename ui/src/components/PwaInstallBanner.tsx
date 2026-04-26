import { useEffect, useState } from "react";
import { usePwaInstall } from "../hooks/usePwaInstall";

const DISMISSED_KEY = "avero.pwa.dismissed";

export function PwaInstallBanner() {
  const { canInstall, install } = usePwaInstall();
  const [dismissed, setDismissed] = useState(true); // start hidden to avoid flash

  // Read localStorage after mount (avoid SSR mismatch)
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISSED_KEY) === "true");
    } catch {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, "true");
    } catch {
      // ignore write errors
    }
    setDismissed(true);
  };

  const handleInstall = async () => {
    await install();
    handleDismiss();
  };

  if (!canInstall || dismissed) return null;

  return (
    <div
      role="banner"
      className="fixed bottom-4 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center justify-between gap-3 rounded-xl border border-border bg-zinc-900 px-4 py-3 shadow-xl"
    >
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-white">Install Avero</span>
        <span className="text-xs text-zinc-400">Add to your home screen for quick access</span>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={handleInstall}
          className="rounded-lg bg-[#F5C518] px-3 py-1.5 text-xs font-semibold text-zinc-900 transition hover:bg-yellow-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F5C518]"
        >
          Install App
        </button>

        <button
          onClick={handleDismiss}
          aria-label="Dismiss install prompt"
          className="rounded-md p-1 text-zinc-400 transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
