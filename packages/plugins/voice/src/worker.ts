import {
  definePlugin,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { TOOL_NAMES } from "./manifest.js";
import { createVoiceService, type VoiceService } from "./voice-service.js";
import type { BusinessHoursSchedule } from "./types.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`Voice plugin misconfigured: ${name} is not set`);
  }
  return value;
}

function toolError(err: unknown): ToolResult {
  if (err instanceof Error) return { error: `Voice plugin error: ${err.message}` };
  return { error: `Voice plugin error: ${String(err)}` };
}

function buildService(ctx: PluginContext, companyId: string): VoiceService {
  return createVoiceService(ctx, companyId, {
    twilio: {
      accountSid: requiredEnv("TWILIO_ACCOUNT_SID"),
      authToken: requiredEnv("TWILIO_AUTH_TOKEN"),
      phoneNumber: requiredEnv("TWILIO_PHONE_NUMBER"),
    },
    deepgramApiKey: requiredEnv("DEEPGRAM_API_KEY"),
    elevenLabsApiKey: requiredEnv("ELEVENLABS_API_KEY"),
    defaultVoiceId: process.env.ELEVENLABS_DEFAULT_VOICE_ID,
  });
}

function extractString(params: unknown, key: string): string | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function extractNumber(params: unknown, key: string): number | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function extractObject(params: unknown, key: string): Record<string, unknown> | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return undefined;
}

function parseSchedule(raw: Record<string, unknown> | undefined): BusinessHoursSchedule | undefined {
  if (!raw) return undefined;
  const days = raw.days;
  if (!days || typeof days !== "object" || Array.isArray(days)) return undefined;
  const parsedDays: BusinessHoursSchedule["days"] = {};
  for (const [name, entry] of Object.entries(days as Record<string, unknown>)) {
    if (entry === null) {
      parsedDays[name.toLowerCase()] = null;
      continue;
    }
    if (entry && typeof entry === "object") {
      const rec = entry as Record<string, unknown>;
      const open = typeof rec.open === "string" ? rec.open : undefined;
      const close = typeof rec.close === "string" ? rec.close : undefined;
      if (open && close) {
        parsedDays[name.toLowerCase()] = { open, close };
      }
    }
  }
  const timezone = typeof raw.timezone === "string" ? raw.timezone : undefined;
  return { timezone, days: parsedDays };
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Voice plugin setup starting");

    ctx.tools.register(
      TOOL_NAMES.answerCall,
      {
        displayName: "Voice: Answer Call",
        description: "Confirm the voice agent is configured to answer inbound calls.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const result = await svc.answerCall();
          return {
            content: `Voice agent is active on ${result.phoneNumber}. Inbound calls are handled automatically.`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.makeOutboundCall,
      {
        displayName: "Voice: Make Outbound Call",
        description: "Place an outbound call and read the supplied script.",
        parametersSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            script: { type: "string" },
          },
          required: ["to", "script"],
        },
      },
      async (params, runCtx) => {
        const to = extractString(params, "to");
        const script = extractString(params, "script");
        if (!to) return { error: "`to` is required" };
        if (!script) return { error: "`script` is required" };
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const result = await svc.makeOutboundCall({ to, script });
          return {
            content: `Placed outbound call to ${to} (SID ${result.callSid}, status ${result.status}).`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.sendVoicemail,
      {
        displayName: "Voice: Send Voicemail",
        description: "Place a call and leave a voicemail using the supplied message.",
        parametersSchema: {
          type: "object",
          properties: {
            to: { type: "string" },
            message: { type: "string" },
          },
          required: ["to", "message"],
        },
      },
      async (params, runCtx) => {
        const to = extractString(params, "to");
        const message = extractString(params, "message");
        if (!to) return { error: "`to` is required" };
        if (!message) return { error: "`message` is required" };
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const result = await svc.sendVoicemail({ to, message });
          return {
            content: `Voicemail dispatched to ${to} (SID ${result.callSid}).`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCallLogs,
      {
        displayName: "Voice: Get Call Logs",
        description: "List recent call logs (most recent first).",
        parametersSchema: {
          type: "object",
          properties: { limit: { type: "number" } },
        },
      },
      async (params, runCtx) => {
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const logs = await svc.getCallLogs(extractNumber(params, "limit") ?? 50);
          return {
            content: `Found ${logs.length} call log${logs.length === 1 ? "" : "s"}.`,
            data: logs,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCallTranscript,
      {
        displayName: "Voice: Get Call Transcript",
        description: "Fetch the transcript for a specific call by Twilio call SID.",
        parametersSchema: {
          type: "object",
          properties: { callSid: { type: "string" } },
          required: ["callSid"],
        },
      },
      async (params, runCtx) => {
        const callSid = extractString(params, "callSid");
        if (!callSid) return { error: "`callSid` is required" };
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const log = await svc.getCallTranscript(callSid);
          if (!log) return { error: `No call found for SID ${callSid}` };
          return {
            content: log.transcript
              ? `Transcript for ${callSid}: ${log.transcript}`
              : `Call ${callSid} has no transcript yet.`,
            data: log,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getVoicemailTranscript,
      {
        displayName: "Voice: Get Voicemail Transcript",
        description: "Fetch the voicemail transcript for a call by Twilio call SID.",
        parametersSchema: {
          type: "object",
          properties: { callSid: { type: "string" } },
          required: ["callSid"],
        },
      },
      async (params, runCtx) => {
        const callSid = extractString(params, "callSid");
        if (!callSid) return { error: "`callSid` is required" };
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const log = await svc.getVoicemailTranscript(callSid);
          if (!log) return { error: `No voicemail found for SID ${callSid}` };
          return {
            content: log.transcript
              ? `Voicemail transcript for ${callSid}: ${log.transcript}`
              : `Voicemail ${callSid} has not been transcribed yet.`,
            data: log,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.setBusinessHours,
      {
        displayName: "Voice: Set Business Hours",
        description: "Configure business hours for inbound call handling.",
        parametersSchema: {
          type: "object",
          properties: { schedule: { type: "object" } },
          required: ["schedule"],
        },
      },
      async (params, runCtx) => {
        const schedule = parseSchedule(extractObject(params, "schedule"));
        if (!schedule) return { error: "`schedule.days` is required" };
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const updated = await svc.setBusinessHours(schedule);
          return {
            content: "Business hours updated.",
            data: updated,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCallStats,
      {
        displayName: "Voice: Get Call Stats",
        description: "Aggregate call stats.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const stats = await svc.getCallStats();
          return {
            content: `Calls: ${stats.totalCalls} total (${stats.inboundCalls} in, ${stats.outboundCalls} out). Completed: ${stats.completedCalls}. Missed: ${stats.missedCalls}.`,
            data: stats,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.configureVoice,
      {
        displayName: "Voice: Configure Voice",
        description: "Set the ElevenLabs voice profile used for TTS.",
        parametersSchema: {
          type: "object",
          properties: {
            voice_id: { type: "string" },
            stability: { type: "number" },
            similarity: { type: "number" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          const svc = buildService(ctx, runCtx.companyId);
          const updated = await svc.configureVoice({
            voiceId: extractString(params, "voice_id"),
            stability: extractNumber(params, "stability"),
            similarity: extractNumber(params, "similarity"),
          });
          return {
            content: `Voice configured${updated.voiceId ? ` (voice_id=${updated.voiceId})` : ""}.`,
            data: updated,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.logger.info("Voice plugin setup complete");
  },

  async onHealth() {
    const missing: string[] = [];
    for (const name of [
      "TWILIO_ACCOUNT_SID",
      "TWILIO_AUTH_TOKEN",
      "TWILIO_PHONE_NUMBER",
      "DEEPGRAM_API_KEY",
      "ELEVENLABS_API_KEY",
    ]) {
      if (!process.env[name]) missing.push(name);
    }
    if (missing.length > 0) {
      return {
        status: "degraded",
        message: `Voice plugin missing env vars: ${missing.join(", ")}`,
      };
    }
    return { status: "ok", message: "Voice plugin configured." };
  },
});

export default plugin;
