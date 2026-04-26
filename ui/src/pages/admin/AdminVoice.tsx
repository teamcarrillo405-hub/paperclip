import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Phone, PhoneCall, PhoneOff, CheckCircle2, XCircle, Clock } from "lucide-react";
import { voiceAiApi, type VoiceSession } from "@/api/voiceAi";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusDot({ ok }: { ok: boolean }) {
  return (
    <span
      className={[
        "inline-block h-2 w-2 rounded-full shrink-0",
        ok ? "bg-green-500" : "bg-red-500",
      ].join(" ")}
    />
  );
}

function ConfigRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1.5">
        <StatusDot ok={ok} />
        <span className="text-xs font-medium">{ok ? "Set" : "Missing"}</span>
      </div>
    </div>
  );
}

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );

  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)),
      1000,
    );
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="tabular-nums text-xs text-muted-foreground">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function SessionCard({
  session,
  onEnd,
  isEnding,
}: {
  session: VoiceSession;
  onEnd: (callSid: string) => void;
  isEnding: boolean;
}) {
  const lastTurn = session.transcript[session.transcript.length - 1] ?? null;

  return (
    <div className="border border-border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-green-500 shrink-0" />
          <span className="text-sm font-medium tabular-nums">{session.from}</span>
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
            active
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            <ElapsedTime startedAt={session.startedAt} />
          </div>
          <button
            type="button"
            disabled={isEnding}
            onClick={() => onEnd(session.callSid)}
            className="flex items-center gap-1 rounded px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
          >
            <PhoneOff className="h-3 w-3" />
            End
          </button>
        </div>
      </div>

      <div className="text-xs text-muted-foreground space-y-0.5">
        <div>
          <span className="font-medium">Company:</span> {session.companyId}
        </div>
        <div>
          <span className="font-medium">Call SID:</span>{" "}
          <span className="font-mono">{session.callSid}</span>
        </div>
        <div>
          <span className="font-medium">Turns:</span> {session.transcript.length}
        </div>
      </div>

      {lastTurn && (
        <div className="rounded bg-muted/50 px-3 py-2">
          <p className="text-xs text-muted-foreground mb-0.5 font-medium uppercase tracking-wide">
            Last transcript line
          </p>
          <p className="text-sm line-clamp-2">{lastTurn}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test call form
// ---------------------------------------------------------------------------

function TestCallForm() {
  const [to, setTo] = useState("");
  const [message, setMessage] = useState(
    "Hello, this is a test call from your AI voice agent. Have a great day!",
  );
  const [companyId, setCompanyId] = useState(
    () => (typeof window !== "undefined" ? (window as Window & { __COMPANY_ID__?: string }).__COMPANY_ID__ : undefined) ?? "",
  );
  const [result, setResult] = useState<{ callSid?: string; error?: string } | null>(null);

  const mutation = useMutation({
    mutationFn: () => voiceAiApi.makeOutboundCall({ companyId, to, message }),
    onSuccess: (data) => setResult({ callSid: data.callSid }),
    onError: (err) =>
      setResult({ error: err instanceof Error ? err.message : "Call failed" }),
  });

  return (
    <section className="border border-border rounded-lg p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Phone className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold">Make Test Call</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="voice-company-id" className="text-xs font-medium text-muted-foreground">
            Company ID
          </label>
          <input
            id="voice-company-id"
            type="text"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="e.g. acme-co"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="voice-to" className="text-xs font-medium text-muted-foreground">
            Phone Number (E.164)
          </label>
          <input
            id="voice-to"
            type="tel"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="+15550001234"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1">
        <label htmlFor="voice-message" className="text-xs font-medium text-muted-foreground">
          Message
        </label>
        <textarea
          id="voice-message"
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={mutation.isPending || !to.trim() || !companyId.trim() || !message.trim()}
          onClick={() => {
            setResult(null);
            mutation.mutate();
          }}
          className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Phone className="h-3.5 w-3.5" />
          {mutation.isPending ? "Calling..." : "Call"}
        </button>

        {result && (
          <div className="flex items-center gap-1.5 text-sm">
            {result.callSid ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                <span className="text-green-700 dark:text-green-400">
                  Call placed — SID:{" "}
                  <span className="font-mono text-xs">{result.callSid}</span>
                </span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-destructive shrink-0" />
                <span className="text-destructive">{result.error}</span>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AdminVoice() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([
      { label: "Enterprise Admin", href: "/admin" },
      { label: "Voice Agent" },
    ]);
  }, [setBreadcrumbs]);

  const statusQuery = useQuery({
    queryKey: ["admin", "voice-ai", "status"],
    queryFn: () => voiceAiApi.getStatus(),
    refetchInterval: 15_000,
  });

  const sessionsQuery = useQuery({
    queryKey: ["admin", "voice-ai", "sessions"],
    queryFn: () => voiceAiApi.getSessions(),
    refetchInterval: 5_000,
  });

  const endMutation = useMutation({
    mutationFn: (callSid: string) => voiceAiApi.endSession(callSid),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "voice-ai", "sessions"] });
    },
  });

  const status = statusQuery.data;
  const sessions = sessionsQuery.data?.sessions ?? [];

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Voice Agent</h2>
        <button
          type="button"
          onClick={() => {
            void statusQuery.refetch();
            void sessionsQuery.refetch();
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Configuration status */}
      <section className="border border-border rounded-lg p-4">
        <div className="flex items-center gap-2 mb-4">
          <Phone className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Configuration</h3>
          {status && (
            <span
              className={[
                "ml-auto inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
                status.configured
                  ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                  : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
              ].join(" ")}
            >
              <StatusDot ok={status.configured} />
              {status.configured ? "Ready" : "Incomplete"}
            </span>
          )}
        </div>

        {statusQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
        {statusQuery.error && (
          <p className="text-sm text-destructive">
            {statusQuery.error instanceof Error
              ? statusQuery.error.message
              : "Failed to load status"}
          </p>
        )}
        {status && (
          <div className="space-y-0">
            <ConfigRow label="TWILIO_ACCOUNT_SID" ok={status.twilio.accountSid} />
            <ConfigRow label="TWILIO_AUTH_TOKEN" ok={status.twilio.authToken} />
            <ConfigRow label="TWILIO_PHONE_NUMBER" ok={status.twilio.phoneNumber} />
            <ConfigRow label="DEEPGRAM_API_KEY" ok={status.deepgram} />
            <ConfigRow label="ELEVENLABS_API_KEY" ok={status.elevenLabs.configured} />
            <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
              <span className="text-sm text-muted-foreground">ElevenLabs Voice ID</span>
              <span className="text-xs font-mono text-foreground">{status.elevenLabs.voiceId}</span>
            </div>
          </div>
        )}
      </section>

      {/* Active sessions */}
      <section className="border border-border rounded-lg p-4 space-y-4">
        <div className="flex items-center gap-2">
          <PhoneCall className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Active Sessions</h3>
          <span className="ml-auto text-xs text-muted-foreground">
            Auto-refreshes every 5s
          </span>
        </div>

        {sessionsQuery.isLoading && (
          <p className="text-sm text-muted-foreground">Loading sessions...</p>
        )}
        {sessionsQuery.error && (
          <p className="text-sm text-destructive">
            {sessionsQuery.error instanceof Error
              ? sessionsQuery.error.message
              : "Failed to load sessions"}
          </p>
        )}

        {!sessionsQuery.isLoading && sessions.length === 0 && (
          <div className="py-6 text-center text-sm text-muted-foreground">
            No active calls right now.
          </div>
        )}

        {sessions.map((session) => (
          <SessionCard
            key={session.callSid}
            session={session}
            onEnd={(sid) => endMutation.mutate(sid)}
            isEnding={endMutation.isPending && endMutation.variables === session.callSid}
          />
        ))}
      </section>

      {/* Test call form */}
      <TestCallForm />
    </div>
  );
}
