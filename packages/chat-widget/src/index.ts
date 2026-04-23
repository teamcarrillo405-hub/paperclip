import { ChatWidget } from "./widget.js";
import type { WidgetInitOptions } from "./types.js";

function resolveApiBase(opts: WidgetInitOptions): string {
  if (opts.apiBaseUrl && opts.apiBaseUrl.length > 0) return opts.apiBaseUrl;
  if (typeof document !== "undefined") {
    const script = document.currentScript as HTMLScriptElement | null;
    if (script?.src) {
      try {
        const u = new URL(script.src);
        return `${u.protocol}//${u.host}`;
      } catch {
        /* fall through */
      }
    }
  }
  if (typeof window !== "undefined" && window.location) {
    return `${window.location.protocol}//${window.location.host}`;
  }
  return "";
}

function boot(opts: WidgetInitOptions): void {
  if (!opts.companyId) {
    console.warn("[avero-chat] AveroChatConfig.companyId is required");
    return;
  }
  const apiBase = resolveApiBase(opts);
  const widget = new ChatWidget(opts.companyId, apiBase);
  window.AveroChat = {
    open: () => widget.open(),
    close: () => widget.close(),
    toggle: () => widget.toggle(),
  };
  void widget.init();
}

function autoInit(): void {
  const cfg = window.AveroChatConfig;
  if (!cfg) return;
  boot(cfg);
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoInit, { once: true });
  } else {
    autoInit();
  }
}

export { ChatWidget } from "./widget.js";
export type { WidgetConfig, WidgetInitOptions, ChatMessage, LeadPayload } from "./types.js";
