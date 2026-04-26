import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { logger } from "../middleware/logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranscriptChunk = {
  sessionId: string;
  text: string;
  isFinal: boolean;
  confidence: number;
  timestamp: number; // ms since session start
};

export type ActionItemDetection = {
  sessionId: string;
  text: string;
  speaker?: string;
  detectedAt: number;
  confidence: "high" | "medium" | "low";
};

export type MeetingSession = {
  id: string;
  companyId: string;
  title: string;
  startedAt: string;
  endedAt?: string;
  status: "active" | "ended" | "error";
  fullTranscript: string;
  actionItems: ActionItemDetection[];
  issuesCreated: string[];
};

export type DeepgramConnection = {
  send(audioBuffer: Buffer): void;
  finish(): void;
};

// ---------------------------------------------------------------------------
// Lazy Deepgram SDK require (CJS compat via createRequire)
// ---------------------------------------------------------------------------

const _require = createRequire(import.meta.url);

// ---------------------------------------------------------------------------
// File-system helpers
// ---------------------------------------------------------------------------

function resolveSessionsFilePath(companyId: string): string {
  return path.resolve(
    resolvePaperclipInstanceRoot(),
    "data",
    "meeting-sessions",
    companyId,
    "sessions.json",
  );
}

function readSessions(companyId: string): MeetingSession[] {
  const filePath = resolveSessionsFilePath(companyId);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as MeetingSession[];
  } catch {
    return [];
  }
}

function writeSessions(companyId: string, sessions: MeetingSession[]): void {
  const filePath = resolveSessionsFilePath(companyId);
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(sessions, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Session CRUD
// ---------------------------------------------------------------------------

export function createMeetingSession(companyId: string, title: string): MeetingSession {
  const sessions = readSessions(companyId);
  const now = new Date().toISOString();
  const sessionTitle = title.trim() ||
    `Meeting ${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  const session: MeetingSession = {
    id: randomUUID(),
    companyId,
    title: sessionTitle,
    startedAt: now,
    status: "active",
    fullTranscript: "",
    actionItems: [],
    issuesCreated: [],
  };
  sessions.push(session);
  writeSessions(companyId, sessions);
  return session;
}

export function getMeetingSession(companyId: string, sessionId: string): MeetingSession | null {
  const sessions = readSessions(companyId);
  return sessions.find((s) => s.id === sessionId) ?? null;
}

export function listMeetingSessions(companyId: string): MeetingSession[] {
  const sessions = readSessions(companyId);
  return [...sessions].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
}

export function appendTranscript(companyId: string, sessionId: string, chunk: string): void {
  const sessions = readSessions(companyId);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;
  const session = sessions[idx]!;
  session.fullTranscript = session.fullTranscript
    ? `${session.fullTranscript} ${chunk}`
    : chunk;
  sessions[idx] = session;
  writeSessions(companyId, sessions);
}

// ---------------------------------------------------------------------------
// Action item detection
// ---------------------------------------------------------------------------

const HIGH_CONFIDENCE_PATTERNS: RegExp[] = [
  /^action item:/i,
  /^todo:/i,
];

const MEDIUM_CONFIDENCE_PATTERNS: RegExp[] = [
  /\bI will\b/i,
  /\bYou will\b/i,
  /\bWe will\b/i,
  /\bPlease\b/i,
  /\bCan you\b/i,
];

const LOW_CONFIDENCE_PATTERNS: RegExp[] = [
  /^let's\b/i,
  /\bFollow up on\b/i,
  /\bMake sure to\b/i,
];

export function detectActionItems(text: string): ActionItemDetection[] {
  const lines = text.split(/[.!?\n]+/).map((l) => l.trim()).filter(Boolean);
  const results: ActionItemDetection[] = [];
  const now = Date.now();

  for (const line of lines) {
    let confidence: "high" | "medium" | "low" | null = null;

    if (HIGH_CONFIDENCE_PATTERNS.some((re) => re.test(line))) {
      confidence = "high";
    } else if (MEDIUM_CONFIDENCE_PATTERNS.some((re) => re.test(line))) {
      confidence = "medium";
    } else if (LOW_CONFIDENCE_PATTERNS.some((re) => re.test(line))) {
      confidence = "low";
    }

    if (confidence !== null) {
      results.push({
        sessionId: "",   // caller sets this
        text: line,
        detectedAt: now,
        confidence,
      });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// End session
// ---------------------------------------------------------------------------

export async function endMeetingSession(
  companyId: string,
  sessionId: string,
): Promise<MeetingSession> {
  const sessions = readSessions(companyId);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) throw new Error(`Meeting session not found: ${sessionId}`);
  const session = sessions[idx]!;
  session.status = "ended";
  session.endedAt = new Date().toISOString();
  sessions[idx] = session;
  writeSessions(companyId, sessions);
  return session;
}

// ---------------------------------------------------------------------------
// Deepgram live connection
// ---------------------------------------------------------------------------

interface DeepgramSdkModule {
  createClient(apiKey: string): {
    listen: {
      live(opts: Record<string, unknown>): DeepgramLiveClient;
    };
  };
}

interface DeepgramLiveClient {
  on(event: "open", listener: () => void): void;
  on(event: "close", listener: () => void): void;
  on(event: "error", listener: (err: Error) => void): void;
  on(event: "Results", listener: (data: DeepgramTranscriptResult) => void): void;
  send(data: Buffer | ArrayBuffer): void;
  requestClose(): void;
}

interface DeepgramTranscriptResult {
  is_final?: boolean;
  channel: {
    alternatives: { transcript: string; confidence: number }[];
  };
}

export async function createDeepgramConnection(
  sessionId: string,
  companyId: string,
  onChunk: (chunk: TranscriptChunk) => void,
  onError: (err: Error) => void,
): Promise<DeepgramConnection> {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    throw new Error("DEEPGRAM_API_KEY is not configured");
  }

  const { createClient } = _require("@deepgram/sdk") as DeepgramSdkModule;
  const deepgramClient = createClient(apiKey);

  const startedAt = Date.now();

  const liveClient = deepgramClient.listen.live({
    model: "nova-2",
    punctuate: true,
    language: "en-US",
    smart_format: true,
    encoding: "linear16",
    sample_rate: 16000,
  });

  return new Promise((resolve, reject) => {
    liveClient.on("open", () => {
      logger.info({ sessionId, companyId }, "deepgram connection opened");

      liveClient.on("Results", (data: DeepgramTranscriptResult) => {
        const alt = data.channel?.alternatives?.[0];
        if (!alt || !alt.transcript) return;

        const chunk: TranscriptChunk = {
          sessionId,
          text: alt.transcript,
          isFinal: data.is_final ?? false,
          confidence: alt.confidence ?? 0,
          timestamp: Date.now() - startedAt,
        };
        onChunk(chunk);
      });

      liveClient.on("error", (err: Error) => {
        logger.error({ err, sessionId, companyId }, "deepgram error");
        onError(err);
      });

      liveClient.on("close", () => {
        logger.info({ sessionId, companyId }, "deepgram connection closed");
      });

      resolve({
        send(audioBuffer: Buffer) {
          try {
            liveClient.send(audioBuffer);
          } catch (err) {
            logger.warn({ err, sessionId }, "deepgram send error");
          }
        },
        finish() {
          try {
            liveClient.requestClose();
          } catch (err) {
            logger.warn({ err, sessionId }, "deepgram finish error");
          }
        },
      });
    });

    liveClient.on("error", (err: Error) => {
      logger.error({ err, sessionId }, "deepgram failed to open");
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Persist action items onto a session record
// ---------------------------------------------------------------------------

export function appendActionItems(
  companyId: string,
  sessionId: string,
  items: ActionItemDetection[],
): void {
  if (items.length === 0) return;
  const sessions = readSessions(companyId);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;
  const session = sessions[idx]!;
  session.actionItems = [...session.actionItems, ...items];
  sessions[idx] = session;
  writeSessions(companyId, sessions);
}

// ---------------------------------------------------------------------------
// Record an issue ID against a session
// ---------------------------------------------------------------------------

export function recordCreatedIssue(
  companyId: string,
  sessionId: string,
  issueId: string,
): void {
  const sessions = readSessions(companyId);
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) return;
  const session = sessions[idx]!;
  if (!session.issuesCreated.includes(issueId)) {
    session.issuesCreated = [...session.issuesCreated, issueId];
  }
  sessions[idx] = session;
  writeSessions(companyId, sessions);
}
