import type { InboundCallRequest } from "./types.js";

/**
 * Build a TwiML response for an inbound Twilio call.
 *
 * The response greets the caller, streams audio to the Deepgram websocket for
 * real-time transcription (when a stream URL is configured), and records a
 * voicemail if the caller does not continue. TwiML is XML and is returned with
 * content-type application/xml.
 */
export interface InboundTwimlOptions {
  greeting?: string;
  streamUrl?: string;
  voicemailEnabled?: boolean;
  voicemailPrompt?: string;
  statusCallbackUrl?: string;
  /** Max voicemail length in seconds. */
  voicemailMaxLength?: number;
}

const DEFAULT_GREETING = "Thanks for calling. Please leave a message after the tone.";
const DEFAULT_VM_PROMPT = "Please leave your message after the tone.";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildInboundTwiml(
  _request: InboundCallRequest,
  options: InboundTwimlOptions = {},
): string {
  const greeting = escapeXml(options.greeting ?? DEFAULT_GREETING);
  const vmPrompt = escapeXml(options.voicemailPrompt ?? DEFAULT_VM_PROMPT);
  const voicemailEnabled = options.voicemailEnabled !== false;
  const maxLen = Math.max(10, Math.min(600, options.voicemailMaxLength ?? 120));

  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<Response>`);
  parts.push(`<Say voice="Polly.Joanna">${greeting}</Say>`);

  if (options.streamUrl) {
    parts.push(`<Start><Stream url="${escapeXml(options.streamUrl)}"/></Start>`);
  }

  if (voicemailEnabled) {
    parts.push(`<Say voice="Polly.Joanna">${vmPrompt}</Say>`);
    const recordAttrs: string[] = [
      `maxLength="${maxLen}"`,
      `playBeep="true"`,
      `transcribe="false"`,
      `trim="trim-silence"`,
    ];
    if (options.statusCallbackUrl) {
      recordAttrs.push(`recordingStatusCallback="${escapeXml(options.statusCallbackUrl)}"`);
    }
    parts.push(`<Record ${recordAttrs.join(" ")}/>`);
  }

  parts.push(`<Hangup/>`);
  parts.push(`</Response>`);
  return parts.join("");
}

export interface OutboundTwimlOptions {
  script: string;
  voice?: string;
  statusCallbackUrl?: string;
}

export function buildOutboundTwiml(options: OutboundTwimlOptions): string {
  const script = escapeXml(options.script);
  const voice = escapeXml(options.voice ?? "Polly.Joanna");
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<Response>`);
  parts.push(`<Say voice="${voice}">${script}</Say>`);
  parts.push(`<Hangup/>`);
  parts.push(`</Response>`);
  return parts.join("");
}

export interface VoicemailTwimlOptions {
  message: string;
  voice?: string;
}

export function buildVoicemailTwiml(options: VoicemailTwimlOptions): string {
  const message = escapeXml(options.message);
  const voice = escapeXml(options.voice ?? "Polly.Joanna");
  const parts: string[] = [];
  parts.push(`<?xml version="1.0" encoding="UTF-8"?>`);
  parts.push(`<Response>`);
  parts.push(`<Pause length="2"/>`);
  parts.push(`<Say voice="${voice}">${message}</Say>`);
  parts.push(`<Hangup/>`);
  parts.push(`</Response>`);
  return parts.join("");
}
