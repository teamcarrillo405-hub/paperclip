// Register in server/src/app.ts:
// import { createMeetingWebSocketServer } from "./realtime/meeting-ws.js";
// createMeetingWebSocketServer(server, db)  ← call after server is created
import { createHash } from "node:crypto";
import type { IncomingMessage, Server as HttpServer } from "node:http";
import { createRequire } from "node:module";
import type { Duplex } from "node:stream";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentApiKeys } from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { publishLiveEvent } from "../services/live-events.js";
import {
  getMeetingSession,
  createDeepgramConnection,
  appendTranscript,
  detectActionItems,
  appendActionItems,
  endMeetingSession,
  type DeepgramConnection,
} from "../services/realtime-transcription.js";

// ---------------------------------------------------------------------------
// Minimal ws type interface (mirrors live-events-ws.ts)
// ---------------------------------------------------------------------------

interface WsSocket {
  readyState: number;
  send(data: string): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: "message", listener: (data: Buffer) => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
}

interface WsServer {
  handleUpgrade(
    req: IncomingMessage,
    socket: Duplex,
    head: Buffer,
    callback: (ws: WsSocket) => void,
  ): void;
  emit(event: "connection", ws: WsSocket, req: IncomingMessage): boolean;
  on(event: "connection", listener: (socket: WsSocket, req: IncomingMessage) => void): void;
  on(event: "close", listener: () => void): void;
}

const _require = createRequire(import.meta.url);
const { WebSocket, WebSocketServer } = _require("ws") as {
  WebSocket: { OPEN: number };
  WebSocketServer: new (opts: { noServer: boolean }) => WsServer;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rejectUpgrade(socket: Duplex, statusLine: string, message: string) {
  const safe = message.replace(/[\r\n]+/g, " ").trim();
  socket.write(
    `HTTP/1.1 ${statusLine}\r\nConnection: close\r\nContent-Type: text/plain\r\n\r\n${safe}`,
  );
  socket.destroy();
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseMeetingUpgrade(url: URL): {
  sessionId: string;
  companyId: string;
  token: string;
} | null {
  if (url.pathname !== "/api/meeting/ws") return null;
  const sessionId = url.searchParams.get("sessionId")?.trim() ?? "";
  const companyId = url.searchParams.get("companyId")?.trim() ?? "";
  const token = url.searchParams.get("token")?.trim() ?? "";
  if (!sessionId || !companyId) return null;
  return { sessionId, companyId, token };
}

async function authorizeToken(
  db: Db,
  companyId: string,
  token: string,
): Promise<boolean> {
  if (!token) {
    // In local_trusted mode there is no token — allow access
    return true;
  }
  const tokenHash = hashToken(token);
  const key = await db
    .select()
    .from(agentApiKeys)
    .where(and(eq(agentApiKeys.keyHash, tokenHash), isNull(agentApiKeys.revokedAt)))
    .then((rows) => rows[0] ?? null);
  return key !== null && key.companyId === companyId;
}

// ---------------------------------------------------------------------------
// Public factory
// ---------------------------------------------------------------------------

export function createMeetingWebSocketServer(server: HttpServer, db: Db): void {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket: WsSocket, req: IncomingMessage) => {
    const rawUrl = req.url ?? "";
    const url = new URL(rawUrl, "http://localhost");
    const params = parseMeetingUpgrade(url);
    if (!params) {
      socket.close(1008, "bad params");
      return;
    }
    const { sessionId, companyId } = params;

    const session = getMeetingSession(companyId, sessionId);
    if (!session) {
      socket.send(JSON.stringify({ type: "error", message: "Session not found" }));
      socket.close(1008, "session not found");
      return;
    }

    let deepgramConn: DeepgramConnection | null = null;

    createDeepgramConnection(
      sessionId,
      companyId,
      (chunk) => {
        // Persist final chunks only to keep transcript clean
        if (chunk.isFinal && chunk.text.trim()) {
          appendTranscript(companyId, sessionId, chunk.text);

          const rawItems = detectActionItems(chunk.text);
          const items = rawItems.map((item) => ({ ...item, sessionId }));
          if (items.length > 0) {
            appendActionItems(companyId, sessionId, items);
          }

          publishLiveEvent({
            companyId,
            type: "meeting:transcript",
            payload: { sessionId, chunk },
          });

          if (items.length > 0) {
            publishLiveEvent({
              companyId,
              type: "meeting:action-item",
              payload: { sessionId, items },
            });
          }
        } else if (!chunk.isFinal) {
          // Forward interim results to clients via the live events bus so the
          // UI can render them in italic
          publishLiveEvent({
            companyId,
            type: "meeting:transcript",
            payload: { sessionId, chunk },
          });
        }
      },
      (err) => {
        logger.error({ err, sessionId, companyId }, "deepgram transcription error");
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Transcription service unavailable",
            }),
          );
          socket.close(1011, "transcription error");
        }
      },
    )
      .then((conn) => {
        deepgramConn = conn;
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "ready", sessionId }));
        }
      })
      .catch((err: Error) => {
        logger.error({ err, sessionId, companyId }, "failed to create deepgram connection");
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(
            JSON.stringify({
              type: "error",
              message: "Transcription service unavailable",
            }),
          );
          socket.close(1011, "deepgram init failed");
        }
      });

    socket.on("message", (data: Buffer) => {
      if (deepgramConn) {
        deepgramConn.send(data);
      }
    });

    socket.on("close", () => {
      if (deepgramConn) {
        deepgramConn.finish();
      }
      endMeetingSession(companyId, sessionId).catch((err) => {
        logger.warn({ err, sessionId, companyId }, "failed to end meeting session on ws close");
      });
    });

    socket.on("error", (err: Error) => {
      logger.warn({ err, sessionId, companyId }, "meeting websocket client error");
    });
  });

  server.on("upgrade", (req, socket, head) => {
    if (!req.url) {
      rejectUpgrade(socket, "400 Bad Request", "missing url");
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const params = parseMeetingUpgrade(url);
    if (!params) {
      // Not a meeting WS upgrade — let other handlers take it
      return;
    }

    const { companyId, token } = params;

    void authorizeToken(db, companyId, token)
      .then((authorized) => {
        if (!authorized) {
          rejectUpgrade(socket, "403 Forbidden", "forbidden");
          return;
        }
        wss.handleUpgrade(req, socket, head, (ws: WsSocket) => {
          wss.emit("connection", ws, req);
        });
      })
      .catch((err) => {
        logger.error({ err, path: req.url }, "meeting ws upgrade authorization failed");
        rejectUpgrade(socket, "500 Internal Server Error", "upgrade failed");
      });
  });
}
