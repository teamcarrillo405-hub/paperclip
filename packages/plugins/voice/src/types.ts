/**
 * Voice plugin types — Twilio telephony, Deepgram STT, ElevenLabs TTS.
 *
 * Only fields the plugin actively reads or surfaces are typed; upstream
 * API responses pass through as `Record<string, unknown>` where useful.
 */

export type CallDirection = "inbound" | "outbound";

export type CallStatus =
  | "queued"
  | "ringing"
  | "in-progress"
  | "completed"
  | "busy"
  | "failed"
  | "no-answer"
  | "canceled";

export interface VoiceCallLog {
  id: string;
  companyId: string;
  callSid: string;
  direction: CallDirection;
  from: string;
  to: string;
  status: string;
  durationSeconds?: number;
  transcript?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InboundCallRequest {
  callSid: string;
  from: string;
  to: string;
}

export interface OutboundCallRequest {
  to: string;
  script: string;
}

export interface OutboundCallResult {
  callSid: string;
  status: string;
  to: string;
  from: string;
}

export interface VoicemailRequest {
  to: string;
  message: string;
}

export interface BusinessHoursSchedule {
  timezone?: string;
  /** Per-day schedule keyed by lowercase weekday name (monday..sunday). */
  days: Record<string, { open: string; close: string } | null>;
}

export interface VoiceConfig {
  voiceId?: string;
  stability?: number;
  similarity?: number;
  businessHours?: BusinessHoursSchedule;
}

export interface CallStats {
  totalCalls: number;
  inboundCalls: number;
  outboundCalls: number;
  completedCalls: number;
  missedCalls: number;
  totalDurationSeconds: number;
  averageDurationSeconds: number;
}

export interface DeepgramTranscriptionOptions {
  model?: string;
  language?: string;
  punctuate?: boolean;
  smartFormat?: boolean;
}

export interface DeepgramTranscriptionResult {
  transcript: string;
  confidence?: number;
  raw?: unknown;
}

export interface ElevenLabsTtsOptions {
  voiceId: string;
  stability?: number;
  similarity?: number;
  modelId?: string;
}

export interface ElevenLabsTtsResult {
  audio: Buffer;
  contentType: string;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  phoneNumber: string;
}
