import { api } from "./client";
import type { ActionItemDetection, MeetingSession } from "../pages/LiveMeetingPage";

export const meetingApi = {
  status: () =>
    api.get<{ deepgramConfigured: boolean }>("/meeting/status"),

  createSession: (companyId: string, title: string) =>
    api.post<{ sessionId: string; session: MeetingSession }>("/meeting/sessions", {
      companyId,
      title,
    }),

  listSessions: (companyId: string) =>
    api.get<{ sessions: MeetingSession[] }>(
      `/meeting/sessions?companyId=${encodeURIComponent(companyId)}`,
    ),

  getSession: (companyId: string, sessionId: string) =>
    api.get<{ session: MeetingSession }>(
      `/meeting/sessions/${encodeURIComponent(sessionId)}?companyId=${encodeURIComponent(companyId)}`,
    ),

  endSession: (companyId: string, sessionId: string, createIssues = false) =>
    api.post<{ session: MeetingSession }>(
      `/meeting/sessions/${encodeURIComponent(sessionId)}/end`,
      { companyId, createIssues },
    ),

  getTranscript: (companyId: string, sessionId: string) =>
    fetch(
      `/api/meeting/sessions/${encodeURIComponent(sessionId)}/transcript?companyId=${encodeURIComponent(companyId)}`,
      { credentials: "include" },
    ).then((r) => r.text()),
};

export type { ActionItemDetection, MeetingSession };
