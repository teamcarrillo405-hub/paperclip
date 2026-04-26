import { api } from "./client";

export interface VoiceAiStatus {
  configured: boolean;
  twilio: {
    accountSid: boolean;
    authToken: boolean;
    phoneNumber: boolean;
  };
  deepgram: boolean;
  elevenLabs: {
    configured: boolean;
    voiceId: string;
  };
}

export interface VoiceSession {
  callSid: string;
  companyId: string;
  from: string;
  transcript: string[];
  status: "active" | "ended";
  startedAt: string;
}

export interface VoiceSessionsResponse {
  sessions: VoiceSession[];
}

export interface OutboundCallRequest {
  companyId: string;
  to: string;
  message: string;
}

export interface OutboundCallResponse {
  callSid: string;
  status: string;
  to: string;
  from: string;
}

export const voiceAiApi = {
  getStatus: () => api.get<VoiceAiStatus>("/voice-ai/status"),
  getSessions: () => api.get<VoiceSessionsResponse>("/voice-ai/sessions"),
  makeOutboundCall: (body: OutboundCallRequest) =>
    api.post<OutboundCallResponse>("/voice-ai/outbound", body),
  endSession: (callSid: string) => api.delete<void>(`/voice-ai/sessions/${encodeURIComponent(callSid)}`),
};
