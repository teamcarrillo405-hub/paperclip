import twilio, { type Twilio } from "twilio";
import type { PluginContext } from "@paperclipai/plugin-sdk";
import { DeepgramStreamClient } from "./deepgram-stream.js";
import { ElevenLabsTtsClient } from "./elevenlabs-tts.js";
import {
  buildOutboundTwiml,
  buildVoicemailTwiml,
} from "./twilio-handler.js";
import type {
  BusinessHoursSchedule,
  CallDirection,
  CallStats,
  DeepgramTranscriptionResult,
  OutboundCallRequest,
  OutboundCallResult,
  TwilioCredentials,
  VoiceCallLog,
  VoiceConfig,
  VoicemailRequest,
} from "./types.js";

const STATE_NAMESPACE = "voice";
const CONFIG_STATE_KEY = "config";
const CALL_LOGS_KEY = "call-logs";
const MAX_IN_MEMORY_LOGS = 500;

export interface VoiceServiceOptions {
  twilio: TwilioCredentials;
  deepgramApiKey: string;
  elevenLabsApiKey: string;
  defaultVoiceId?: string;
}

/**
 * Core voice orchestration.
 *
 * Wraps Twilio for call origination, Deepgram for STT and ElevenLabs for TTS.
 * Uses the plugin state store (scoped per-company) for call logs and voice
 * configuration so the service remains stateless across worker restarts.
 */
export class VoiceService {
  private readonly twilioClient: Twilio;
  private readonly deepgram: DeepgramStreamClient;
  private readonly elevenLabs: ElevenLabsTtsClient;
  private readonly phoneNumber: string;
  private readonly defaultVoiceId?: string;

  constructor(
    private readonly ctx: PluginContext,
    private readonly companyId: string,
    options: VoiceServiceOptions,
  ) {
    this.twilioClient = twilio(options.twilio.accountSid, options.twilio.authToken);
    this.deepgram = new DeepgramStreamClient(options.deepgramApiKey);
    this.elevenLabs = new ElevenLabsTtsClient(options.elevenLabsApiKey);
    this.phoneNumber = options.twilio.phoneNumber;
    this.defaultVoiceId = options.defaultVoiceId;
  }

  get phoneFromNumber(): string {
    return this.phoneNumber;
  }

  async answerCall(): Promise<{ message: string; phoneNumber: string }> {
    return {
      message: "Inbound calls are routed automatically through the Twilio webhook.",
      phoneNumber: this.phoneNumber,
    };
  }

  async makeOutboundCall(request: OutboundCallRequest): Promise<OutboundCallResult> {
    if (!request.to) throw new Error("`to` phone number is required");
    if (!request.script) throw new Error("`script` is required");
    const twiml = buildOutboundTwiml({ script: request.script });
    const call = await this.twilioClient.calls.create({
      to: request.to,
      from: this.phoneNumber,
      twiml,
    });
    const log: VoiceCallLog = {
      id: call.sid,
      companyId: this.companyId,
      callSid: call.sid,
      direction: "outbound",
      from: this.phoneNumber,
      to: request.to,
      status: call.status ?? "queued",
      transcript: request.script,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.appendCallLog(log);
    return {
      callSid: call.sid,
      status: call.status ?? "queued",
      to: request.to,
      from: this.phoneNumber,
    };
  }

  async sendVoicemail(request: VoicemailRequest): Promise<OutboundCallResult> {
    if (!request.to) throw new Error("`to` phone number is required");
    if (!request.message) throw new Error("`message` is required");
    const twiml = buildVoicemailTwiml({ message: request.message });
    const call = await this.twilioClient.calls.create({
      to: request.to,
      from: this.phoneNumber,
      twiml,
      machineDetection: "Enable",
    });
    const log: VoiceCallLog = {
      id: call.sid,
      companyId: this.companyId,
      callSid: call.sid,
      direction: "outbound",
      from: this.phoneNumber,
      to: request.to,
      status: call.status ?? "queued",
      transcript: `[voicemail] ${request.message}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.appendCallLog(log);
    return {
      callSid: call.sid,
      status: call.status ?? "queued",
      to: request.to,
      from: this.phoneNumber,
    };
  }

  async getCallLogs(limit = 50): Promise<VoiceCallLog[]> {
    const logs = await this.readCallLogs();
    const n = Math.max(1, Math.min(500, limit));
    return logs.slice(0, n);
  }

  async getCallTranscript(callSid: string): Promise<VoiceCallLog | null> {
    const logs = await this.readCallLogs();
    return logs.find((log) => log.callSid === callSid) ?? null;
  }

  async getVoicemailTranscript(callSid: string): Promise<VoiceCallLog | null> {
    return this.getCallTranscript(callSid);
  }

  async transcribeRecording(recordingUrl: string): Promise<DeepgramTranscriptionResult> {
    return this.deepgram.transcribeUrl(recordingUrl);
  }

  async synthesizeSpeech(
    text: string,
    overrides: { voiceId?: string; stability?: number; similarity?: number } = {},
  ): Promise<{ audio: Buffer; contentType: string }> {
    const config = await this.readConfig();
    const voiceId = overrides.voiceId ?? config.voiceId ?? this.defaultVoiceId;
    if (!voiceId) throw new Error("No ElevenLabs voice_id configured");
    return this.elevenLabs.synthesize(text, {
      voiceId,
      stability: overrides.stability ?? config.stability,
      similarity: overrides.similarity ?? config.similarity,
    });
  }

  async setBusinessHours(schedule: BusinessHoursSchedule): Promise<VoiceConfig> {
    const config = await this.readConfig();
    const updated: VoiceConfig = { ...config, businessHours: schedule };
    await this.writeConfig(updated);
    return updated;
  }

  async configureVoice(overrides: {
    voiceId?: string;
    stability?: number;
    similarity?: number;
  }): Promise<VoiceConfig> {
    const config = await this.readConfig();
    const updated: VoiceConfig = {
      ...config,
      voiceId: overrides.voiceId ?? config.voiceId,
      stability: overrides.stability ?? config.stability,
      similarity: overrides.similarity ?? config.similarity,
    };
    await this.writeConfig(updated);
    return updated;
  }

  async getCallStats(): Promise<CallStats> {
    const logs = await this.readCallLogs();
    let inboundCalls = 0;
    let outboundCalls = 0;
    let completedCalls = 0;
    let missedCalls = 0;
    let totalDurationSeconds = 0;

    for (const log of logs) {
      if (log.direction === "inbound") inboundCalls += 1;
      else outboundCalls += 1;
      if (log.status === "completed") completedCalls += 1;
      if (log.status === "no-answer" || log.status === "busy" || log.status === "failed") {
        missedCalls += 1;
      }
      if (typeof log.durationSeconds === "number") {
        totalDurationSeconds += log.durationSeconds;
      }
    }

    const totalCalls = logs.length;
    const averageDurationSeconds =
      completedCalls > 0 ? Math.round(totalDurationSeconds / completedCalls) : 0;

    return {
      totalCalls,
      inboundCalls,
      outboundCalls,
      completedCalls,
      missedCalls,
      totalDurationSeconds,
      averageDurationSeconds,
    };
  }

  async recordInboundCall(params: {
    callSid: string;
    from: string;
    to: string;
    status?: string;
  }): Promise<VoiceCallLog> {
    const log: VoiceCallLog = {
      id: params.callSid,
      companyId: this.companyId,
      callSid: params.callSid,
      direction: "inbound" as CallDirection,
      from: params.from,
      to: params.to,
      status: params.status ?? "in-progress",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await this.appendCallLog(log);
    return log;
  }

  async updateCallStatus(params: {
    callSid: string;
    status: string;
    durationSeconds?: number;
    transcript?: string;
  }): Promise<VoiceCallLog | null> {
    const logs = await this.readCallLogs();
    const idx = logs.findIndex((log) => log.callSid === params.callSid);
    if (idx < 0) return null;
    const updated: VoiceCallLog = {
      ...logs[idx],
      status: params.status,
      durationSeconds: params.durationSeconds ?? logs[idx].durationSeconds,
      transcript: params.transcript ?? logs[idx].transcript,
      updatedAt: new Date().toISOString(),
    };
    logs[idx] = updated;
    await this.writeCallLogs(logs);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // Persistence helpers
  // ---------------------------------------------------------------------------

  private async readConfig(): Promise<VoiceConfig> {
    const raw = await this.ctx.state.get({
      scopeKind: "company",
      scopeId: this.companyId,
      namespace: STATE_NAMESPACE,
      stateKey: CONFIG_STATE_KEY,
    });
    if (raw && typeof raw === "object") return raw as VoiceConfig;
    return {};
  }

  private async writeConfig(config: VoiceConfig): Promise<void> {
    await this.ctx.state.set(
      {
        scopeKind: "company",
        scopeId: this.companyId,
        namespace: STATE_NAMESPACE,
        stateKey: CONFIG_STATE_KEY,
      },
      config as unknown as Record<string, unknown>,
    );
  }

  private async readCallLogs(): Promise<VoiceCallLog[]> {
    const raw = await this.ctx.state.get({
      scopeKind: "company",
      scopeId: this.companyId,
      namespace: STATE_NAMESPACE,
      stateKey: CALL_LOGS_KEY,
    });
    if (raw && typeof raw === "object" && Array.isArray((raw as { logs?: unknown }).logs)) {
      return (raw as { logs: VoiceCallLog[] }).logs;
    }
    return [];
  }

  private async writeCallLogs(logs: VoiceCallLog[]): Promise<void> {
    const trimmed = logs.slice(0, MAX_IN_MEMORY_LOGS);
    await this.ctx.state.set(
      {
        scopeKind: "company",
        scopeId: this.companyId,
        namespace: STATE_NAMESPACE,
        stateKey: CALL_LOGS_KEY,
      },
      { logs: trimmed } as unknown as Record<string, unknown>,
    );
  }

  private async appendCallLog(log: VoiceCallLog): Promise<void> {
    const logs = await this.readCallLogs();
    logs.unshift(log);
    await this.writeCallLogs(logs);
  }
}

export function createVoiceService(
  ctx: PluginContext,
  companyId: string,
  options: VoiceServiceOptions,
): VoiceService {
  return new VoiceService(ctx, companyId, options);
}
