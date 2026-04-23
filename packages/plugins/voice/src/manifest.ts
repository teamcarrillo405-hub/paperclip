import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.voice";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  answerCall: "voice_answer_call",
  makeOutboundCall: "voice_make_outbound_call",
  sendVoicemail: "voice_send_voicemail",
  getCallLogs: "voice_get_call_logs",
  getCallTranscript: "voice_get_call_transcript",
  getVoicemailTranscript: "voice_get_voicemail_transcript",
  setBusinessHours: "voice_set_business_hours",
  getCallStats: "voice_get_call_stats",
  configureVoice: "voice_configure_voice",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Voice (Twilio + Deepgram + ElevenLabs)",
  description:
    "AI phone agent for SMBs: answer inbound calls, place outbound calls, leave voicemails, and transcribe conversations using Twilio, Deepgram, and ElevenLabs.",
  author: "Avero AI",
  categories: ["connector", "automation"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.answerCall,
      displayName: "Voice: Answer Call",
      description:
        "Confirm the voice agent is configured to answer inbound calls. Returns the configured phone number. Inbound calls are routed automatically via the Twilio webhook.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.makeOutboundCall,
      displayName: "Voice: Make Outbound Call",
      description:
        "Place an outbound call to `to` and read the provided `script` aloud. Returns the Twilio call SID.",
      parametersSchema: {
        type: "object",
        properties: {
          to: { type: "string" },
          script: { type: "string" },
        },
        required: ["to", "script"],
      },
    },
    {
      name: TOOL_NAMES.sendVoicemail,
      displayName: "Voice: Send Voicemail",
      description:
        "Place a call to `to` and, upon voicemail pickup, leave `message` using the configured voice.",
      parametersSchema: {
        type: "object",
        properties: {
          to: { type: "string" },
          message: { type: "string" },
        },
        required: ["to", "message"],
      },
    },
    {
      name: TOOL_NAMES.getCallLogs,
      displayName: "Voice: Get Call Logs",
      description:
        "List recent call logs (most recent first). Optional `limit` caps the number of rows returned.",
      parametersSchema: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
    {
      name: TOOL_NAMES.getCallTranscript,
      displayName: "Voice: Get Call Transcript",
      description: "Fetch the transcript for a specific call by Twilio call SID.",
      parametersSchema: {
        type: "object",
        properties: { callSid: { type: "string" } },
        required: ["callSid"],
      },
    },
    {
      name: TOOL_NAMES.getVoicemailTranscript,
      displayName: "Voice: Get Voicemail Transcript",
      description:
        "Fetch the transcribed voicemail content for a call by Twilio call SID.",
      parametersSchema: {
        type: "object",
        properties: { callSid: { type: "string" } },
        required: ["callSid"],
      },
    },
    {
      name: TOOL_NAMES.setBusinessHours,
      displayName: "Voice: Set Business Hours",
      description:
        "Configure business hours for inbound call handling. `schedule.days` maps lowercase weekday names to { open, close } in HH:MM 24h format, or null if closed.",
      parametersSchema: {
        type: "object",
        properties: {
          schedule: {
            type: "object",
            properties: {
              timezone: { type: "string" },
              days: { type: "object" },
            },
            required: ["days"],
          },
        },
        required: ["schedule"],
      },
    },
    {
      name: TOOL_NAMES.getCallStats,
      displayName: "Voice: Get Call Stats",
      description:
        "Aggregate call counts (inbound/outbound/completed/missed) and total/average durations.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.configureVoice,
      displayName: "Voice: Configure Voice",
      description:
        "Set the ElevenLabs voice profile used for TTS. `voice_id` selects the voice, `stability` and `similarity` (both 0..1) tune the synthesis.",
      parametersSchema: {
        type: "object",
        properties: {
          voice_id: { type: "string" },
          stability: { type: "number" },
          similarity: { type: "number" },
        },
      },
    },
  ],
};

export default manifest;
