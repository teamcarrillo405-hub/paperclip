import { useEffect, useRef, useState } from "react";
import type { LiveEvent } from "@paperclipai/shared";

/**
 * A typed union of the live events emitted by the server WebSocket.
 * The server sends `LiveEvent` objects (from @paperclipai/shared) whose
 * `payload` is an opaque Record. We re-export the shared type directly so
 * callers get the full shape without duplication.
 */
export type CompanyLiveEvent = LiveEvent;

const SOCKET_OPEN = 1;
const SOCKET_CONNECTING = 0;
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

interface UseCompanyLiveEventsResult {
  isConnected: boolean;
  lastEvent: CompanyLiveEvent | null;
}

function buildWsUrl(companyId: string, token: string | null): string {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const base = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
  if (token) {
    return `${base}?token=${encodeURIComponent(token)}`;
  }
  return base;
}

function closeSocketQuietly(
  socket: WebSocket | null,
  reason: string,
): void {
  if (!socket) return;
  if (socket.readyState === SOCKET_CONNECTING) {
    socket.onopen = () => {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      socket.close(1000, reason);
    };
    socket.onmessage = null;
    socket.onerror = () => undefined;
    socket.onclose = null;
    return;
  }
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;
  if (socket.readyState === SOCKET_OPEN) {
    socket.close(1000, reason);
  }
}

/**
 * Connects to the company live-events WebSocket and exposes connection state
 * and the most recent event. Authentication is handled by the browser session
 * cookie (same as LiveUpdatesProvider). An optional JWT token can be passed
 * as a query parameter for agent contexts.
 *
 * - Only connects when `companyId` is defined.
 * - Reconnects on disconnect with exponential backoff capped at 30 s.
 * - Never throws on connection failure — sets `isConnected` to false instead.
 * - Cleans up the WebSocket on unmount.
 *
 * NOTE: For most consumers the global `LiveUpdatesProvider` already handles
 * query invalidation and toasts. This hook is for components that need to
 * react to `isConnected` state directly (e.g. a "Live" indicator) or inspect
 * individual events without re-implementing the full event pipeline.
 */
export function useCompanyLiveEvents(
  companyId: string | undefined,
  token?: string | null,
): UseCompanyLiveEventsResult {
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<CompanyLiveEvent | null>(null);

  // Keep token in a ref so reconnects always use the latest value without
  // restarting the effect.
  const tokenRef = useRef<string | null>(token ?? null);
  useEffect(() => {
    tokenRef.current = token ?? null;
  }, [token]);

  useEffect(() => {
    if (!companyId) {
      setIsConnected(false);
      return;
    }

    let closed = false;
    let reconnectAttempt = 0;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;

    const clearReconnect = () => {
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
    };

    const scheduleReconnect = () => {
      if (closed) return;
      reconnectAttempt += 1;
      const delayMs = Math.min(
        MAX_RECONNECT_DELAY_MS,
        BASE_RECONNECT_DELAY_MS * 2 ** Math.min(reconnectAttempt - 1, 5),
      );
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const connect = () => {
      if (closed) return;

      const url = buildWsUrl(companyId, tokenRef.current);
      const nextSocket = new WebSocket(url);
      socket = nextSocket;

      nextSocket.onopen = () => {
        if (closed || socket !== nextSocket) {
          closeSocketQuietly(nextSocket, "stale_connection");
          return;
        }
        reconnectAttempt = 0;
        setIsConnected(true);
      };

      nextSocket.onmessage = (message: MessageEvent) => {
        if (closed || socket !== nextSocket) return;
        const raw = typeof message.data === "string" ? message.data : "";
        if (!raw) return;
        try {
          const parsed = JSON.parse(raw) as CompanyLiveEvent;
          setLastEvent(parsed);
        } catch {
          // Non-JSON payloads (e.g. ping frames proxied as text) are silently ignored.
        }
      };

      nextSocket.onerror = () => {
        // Do not close here — onclose fires after onerror and drives the
        // reconnect. Closing in onerror produces noisy "closed before
        // connection established" browser console errors.
      };

      nextSocket.onclose = () => {
        if (socket !== nextSocket) return;
        socket = null;
        setIsConnected(false);
        if (!closed) {
          scheduleReconnect();
        }
      };
    };

    // Slight delay mirrors LiveUpdatesProvider's pattern: lets React StrictMode
    // double-invoke cleanup fire before the WebSocket is created, avoiding the
    // "WebSocket closed before connection established" dev-mode console error.
    const connectTimer = window.setTimeout(connect, 0);

    return () => {
      closed = true;
      window.clearTimeout(connectTimer);
      clearReconnect();
      const activeSocket = socket;
      socket = null;
      setIsConnected(false);
      closeSocketQuietly(activeSocket, "hook_unmount");
    };
  }, [companyId]);

  return { isConnected, lastEvent };
}
