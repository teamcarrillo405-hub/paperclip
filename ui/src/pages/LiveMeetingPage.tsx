import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Play, CheckSquare, Square as SquareIcon, AlertCircle } from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { meetingApi } from "../api/meeting";
import { cn } from "../lib/utils";

// ---------------------------------------------------------------------------
// Types (also re-exported for api/meeting.ts)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types for transcript line rendering
// ---------------------------------------------------------------------------

type TranscriptLine = {
  id: string;
  text: string;
  isFinal: boolean;
};

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

function StatusDot({ status }: { status: ConnectionStatus }) {
  return (
    <span className="flex items-center gap-1.5 text-xs">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          status === "connected" && "bg-green-500",
          status === "connecting" && "bg-yellow-400",
          status === "error" && "bg-red-500",
          status === "idle" && "bg-muted-foreground",
        )}
      />
      {status === "connected" && "Connected"}
      {status === "connecting" && "Connecting..."}
      {status === "error" && "Error"}
      {status === "idle" && "Not connected"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ level }: { level: ActionItemDetection["confidence"] }) {
  return (
    <span
      className={cn(
        "rounded px-1.5 py-0.5 text-xs font-semibold uppercase",
        level === "high" && "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
        level === "medium" &&
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-200",
        level === "low" && "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
      )}
    >
      {level}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Elapsed timer
// ---------------------------------------------------------------------------

function useElapsedTimer(startedAt: string | null) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) {
      setElapsed(0);
      return;
    }
    const start = new Date(startedAt).getTime();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return elapsed;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

const MAX_TRANSCRIPT_LINES = 500;

export function LiveMeetingPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const [sessionTitle, setSessionTitle] = useState("");
  const [session, setSession] = useState<MeetingSession | null>(null);
  const [pageStatus, setPageStatus] = useState<"idle" | "connecting" | "active" | "ended">(
    "idle",
  );
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [actionItems, setActionItems] = useState<ActionItemDetection[]>([]);
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set());
  const [isRecording, setIsRecording] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingIssues, setIsCreatingIssues] = useState(false);

  const transcriptEndRef = useRef<HTMLDivElement | null>(null);
  const audioWsRef = useRef<WebSocket | null>(null);
  const liveEventsWsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const lineCounterRef = useRef(0);

  const elapsed = useElapsedTimer(pageStatus === "active" ? (session?.startedAt ?? null) : null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Live Meeting" }]);
  }, [setBreadcrumbs]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [transcriptLines]);

  // ---------------------------------------------------------------------------
  // Live events WebSocket (receives meeting:transcript + meeting:action-item)
  // ---------------------------------------------------------------------------

  const connectLiveEvents = useCallback(
    (companyId: string) => {
      if (liveEventsWsRef.current) {
        liveEventsWsRef.current.close();
        liveEventsWsRef.current = null;
      }
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl = `${protocol}://${window.location.host}/api/companies/${encodeURIComponent(companyId)}/events/ws`;
      const ws = new WebSocket(wsUrl);
      liveEventsWsRef.current = ws;

      ws.onmessage = (ev: MessageEvent) => {
        try {
          const event = JSON.parse(ev.data as string) as {
            type: string;
            payload: Record<string, unknown>;
          };

          if (event.type === "meeting:transcript") {
            const chunk = event.payload.chunk as {
              text: string;
              isFinal: boolean;
              sessionId: string;
            } | null;
            if (!chunk?.text) return;

            lineCounterRef.current += 1;
            const id = `line-${lineCounterRef.current}`;

            setTranscriptLines((prev) => {
              const next = [...prev];
              // Replace last interim line if it was non-final
              if (next.length > 0 && !next[next.length - 1]!.isFinal) {
                next[next.length - 1] = { id, text: chunk.text, isFinal: chunk.isFinal };
              } else {
                next.push({ id, text: chunk.text, isFinal: chunk.isFinal });
              }
              // Cap at MAX_TRANSCRIPT_LINES
              if (next.length > MAX_TRANSCRIPT_LINES) {
                return next.slice(next.length - MAX_TRANSCRIPT_LINES);
              }
              return next;
            });
          }

          if (event.type === "meeting:action-item") {
            const items = event.payload.items as ActionItemDetection[] | null;
            if (!items?.length) return;
            setActionItems((prev) => {
              const combined = [...prev, ...items];
              // Deduplicate by text+detectedAt
              const seen = new Set<string>();
              return combined.filter((item) => {
                const key = `${item.text}::${item.detectedAt}`;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
              });
            });
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        // non-fatal — live events reconnect is handled by LiveUpdatesProvider normally
      };
    },
    [],
  );

  useEffect(() => {
    return () => {
      liveEventsWsRef.current?.close();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Start session
  // ---------------------------------------------------------------------------

  const handleStartSession = useCallback(async () => {
    if (!selectedCompanyId) return;
    setPageStatus("connecting");
    setErrorMessage(null);
    try {
      const result = await meetingApi.createSession(selectedCompanyId, sessionTitle);
      setSession(result.session);
      setPageStatus("active");
      setTranscriptLines([]);
      setActionItems([]);
      setCheckedItems(new Set());
      connectLiveEvents(selectedCompanyId);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create session");
      setPageStatus("idle");
    }
  }, [selectedCompanyId, sessionTitle, connectLiveEvents]);

  // ---------------------------------------------------------------------------
  // Share audio / start recording
  // ---------------------------------------------------------------------------

  const handleShareAudio = useCallback(async () => {
    if (!session || !selectedCompanyId) return;
    setConnectionStatus("connecting");
    setErrorMessage(null);

    try {
      // Request display media with audio only
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: false,
      });

      const audioTrack = displayStream.getAudioTracks()[0];
      if (!audioTrack) {
        displayStream.getTracks().forEach((t) => t.stop());
        throw new Error("No audio track available in the captured stream");
      }

      const mediaStream = new MediaStream([audioTrack]);
      streamRef.current = displayStream;

      // Build audio WebSocket URL
      const protocol = window.location.protocol === "https:" ? "wss" : "ws";
      const wsUrl =
        `${protocol}://${window.location.host}/api/meeting/ws` +
        `?sessionId=${encodeURIComponent(session.id)}` +
        `&companyId=${encodeURIComponent(selectedCompanyId)}`;

      const audioWs = new WebSocket(wsUrl);
      audioWsRef.current = audioWs;

      audioWs.onopen = () => {
        setConnectionStatus("connected");
        setIsRecording(true);

        // Set up Web Audio processing
        const audioContext = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioContext;

        const source = audioContext.createMediaStreamSource(mediaStream);
        // eslint-disable-next-line @typescript-eslint/no-deprecated
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e: AudioProcessingEvent) => {
          const inputData = e.inputBuffer.getChannelData(0);
          const pcm16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            pcm16[i] = Math.max(-32768, Math.min(32767, (inputData[i] ?? 0) * 32768));
          }
          if (audioWs.readyState === WebSocket.OPEN) {
            audioWs.send(pcm16.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
      };

      audioWs.onmessage = (ev: MessageEvent) => {
        try {
          const msg = JSON.parse(ev.data as string) as { type: string; message?: string };
          if (msg.type === "error") {
            setErrorMessage(msg.message ?? "Transcription service error");
            setConnectionStatus("error");
          }
        } catch {
          // ignore non-JSON
        }
      };

      audioWs.onerror = () => {
        setConnectionStatus("error");
        setErrorMessage("Audio streaming connection failed");
      };

      audioWs.onclose = () => {
        if (isRecording) {
          setConnectionStatus("idle");
          setIsRecording(false);
        }
      };

      // Clean up when the audio track itself ends (user stops screen share)
      audioTrack.onended = () => {
        handleStopRecording();
      };
    } catch (err) {
      setConnectionStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to capture audio",
      );
    }
  }, [session, selectedCompanyId, isRecording]);

  // ---------------------------------------------------------------------------
  // Stop recording
  // ---------------------------------------------------------------------------

  const handleStopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    audioContextRef.current?.close().catch(() => {});
    audioContextRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;

    audioWsRef.current?.close();
    audioWsRef.current = null;

    setIsRecording(false);
    setConnectionStatus("idle");
  }, []);

  // ---------------------------------------------------------------------------
  // End meeting
  // ---------------------------------------------------------------------------

  const handleEndMeeting = useCallback(async () => {
    if (!session || !selectedCompanyId) return;
    handleStopRecording();
    liveEventsWsRef.current?.close();
    liveEventsWsRef.current = null;

    try {
      const result = await meetingApi.endSession(selectedCompanyId, session.id, false);
      setSession(result.session);
    } catch {
      // best-effort
    }
    setPageStatus("ended");
  }, [session, selectedCompanyId, handleStopRecording]);

  // ---------------------------------------------------------------------------
  // Create issues from checked action items
  // ---------------------------------------------------------------------------

  const handleCreateIssues = useCallback(async () => {
    if (!session || !selectedCompanyId) return;
    setIsCreatingIssues(true);
    try {
      const result = await meetingApi.endSession(selectedCompanyId, session.id, true);
      setSession(result.session);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to create issues");
    } finally {
      setIsCreatingIssues(false);
    }
  }, [session, selectedCompanyId]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (!selectedCompanyId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Select a company to use Live Meeting.
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 gap-0 divide-x divide-border">
      {/* ------------------------------------------------------------------ */}
      {/* Left panel — controls                                               */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex w-80 shrink-0 flex-col gap-5 overflow-y-auto p-5">
        <h1 className="flex items-center gap-2 text-base font-semibold">
          <Mic className="h-4 w-4 text-muted-foreground" />
          Live Meeting
        </h1>

        {errorMessage && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 mb-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {pageStatus === "idle" && (
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">Meeting title</span>
              <input
                className="rounded border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                type="text"
                placeholder={`Meeting ${new Date().toLocaleDateString()}`}
                value={sessionTitle}
                onChange={(e) => setSessionTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void handleStartSession();
                }}
              />
            </label>
            <button
              onClick={() => void handleStartSession()}
              className="rounded bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Start Session
            </button>
            <p className="text-xs text-muted-foreground">
              A session captures your meeting transcript in real time.
            </p>
          </div>
        )}

        {pageStatus === "connecting" && (
          <p className="text-sm text-muted-foreground">Creating session...</p>
        )}

        {(pageStatus === "active" || pageStatus === "ended") && session && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Session
              </p>
              <p className="mt-0.5 text-sm font-semibold">{session.title}</p>
              {pageStatus === "active" && (
                <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
                  {formatElapsed(elapsed)}
                </p>
              )}
              {pageStatus === "ended" && session.endedAt && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ended {new Date(session.endedAt).toLocaleTimeString()}
                </p>
              )}
            </div>

            {pageStatus === "active" && (
              <div className="flex flex-col gap-2">
                <StatusDot status={connectionStatus} />

                {!isRecording ? (
                  <button
                    onClick={() => void handleShareAudio()}
                    className="flex items-center justify-center gap-2 rounded bg-amber-500 px-4 py-3 text-sm font-bold text-white hover:bg-amber-600 transition-colors"
                  >
                    <Mic className="h-4 w-4" />
                    Share Audio
                  </button>
                ) : (
                  <button
                    onClick={handleStopRecording}
                    className="flex items-center justify-center gap-2 rounded border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                  >
                    <MicOff className="h-4 w-4" />
                    Stop Recording
                  </button>
                )}

                <button
                  onClick={() => void handleEndMeeting()}
                  className="flex items-center justify-center gap-2 rounded border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <Square className="h-3.5 w-3.5" />
                  End Meeting
                </button>
              </div>
            )}

            {pageStatus === "ended" && (
              <div className="rounded border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                Meeting has ended.{" "}
                {(session.issuesCreated?.length ?? 0) > 0 &&
                  `${session.issuesCreated.length} issue${session.issuesCreated.length === 1 ? "" : "s"} created.`}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Right panel — transcript + action items                             */}
      {/* ------------------------------------------------------------------ */}
      <div className="flex min-w-0 flex-1 flex-col divide-y divide-border">
        {/* Transcript */}
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="shrink-0 border-b border-border px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Live Transcript
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 font-mono text-sm leading-relaxed">
            {transcriptLines.length === 0 ? (
              <p className="text-muted-foreground text-xs">
                {pageStatus === "active"
                  ? 'Click "Share Audio" to begin transcription.'
                  : pageStatus === "ended"
                    ? "Session has ended."
                    : "Transcript will appear here once the session starts."}
              </p>
            ) : (
              (transcriptLines ?? []).map((line) => (
                <span
                  key={line.id}
                  className={cn(
                    "block",
                    !line.isFinal && "italic text-muted-foreground",
                    line.isFinal && "text-foreground",
                  )}
                >
                  {line.text}
                </span>
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Action Items */}
        <div className="flex shrink-0 flex-col" style={{ maxHeight: "40%" }}>
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Detected Action Items
            </h2>
            {actionItems.length > 0 && pageStatus !== "ended" && (
              <button
                onClick={() => void handleCreateIssues()}
                disabled={isCreatingIssues}
                className="flex items-center gap-1.5 rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                <Play className="h-3 w-3" />
                {isCreatingIssues ? "Creating..." : "Create Avero Issues"}
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pb-4">
            {actionItems.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Action items will be detected automatically during the meeting.
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {(actionItems ?? []).map((item, idx) => (
                  <li
                    key={`${item.detectedAt}-${idx}`}
                    className="flex items-start gap-2 rounded border border-border bg-card px-3 py-2 text-sm"
                  >
                    <button
                      className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setCheckedItems((prev) => {
                          const next = new Set(prev);
                          if (next.has(idx)) next.delete(idx);
                          else next.add(idx);
                          return next;
                        });
                      }}
                    >
                      {checkedItems.has(idx) ? (
                        <CheckSquare className="h-4 w-4 text-primary" />
                      ) : (
                        <SquareIcon className="h-4 w-4" />
                      )}
                    </button>
                    <span className="flex-1">{item.text}</span>
                    <ConfidenceBadge level={item.confidence} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
