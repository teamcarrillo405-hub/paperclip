// Register in server/src/app.ts:
// import { meetingRoutes } from "./routes/meetings.js";
// api.use(meetingRoutes(db));

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  generateMeetingBrief,
  processMeetingTranscript,
} from "../services/meeting-intelligence.js";

const PORT = process.env.PORT ?? "3100";
const BASE = `http://localhost:${PORT}/api`;

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function optionalBool(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value === "true" || value === "1";
  return false;
}

type CalendarEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string }>;
  description?: string;
};

export function meetingRoutes(db: Db) {
  const router = Router();

  /**
   * GET /meetings/brief
   * Query params: companyId, eventId, createDoc?
   * Returns a MeetingBrief assembled from calendar, knowledge base, and open issues.
   */
  router.get("/meetings/brief", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    const eventId = requireString(req.query.eventId, "eventId");
    assertCompanyAccess(req, companyId);

    const createDoc = optionalBool(req.query.createDoc);
    const brief = await generateMeetingBrief({ companyId, eventId, db, createDoc });
    res.json(brief);
  });

  /**
   * POST /meetings/transcript
   * Body: { companyId, transcript, eventTitle, attendees?, createIssues? }
   * Processes a meeting transcript, extracts action items, and optionally
   * creates issues for each one. Returns a MeetingTranscriptResult.
   */
  router.post("/meetings/transcript", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    const transcript = requireString(body.transcript, "transcript");
    const eventTitle = requireString(body.eventTitle, "eventTitle");
    assertCompanyAccess(req, companyId);

    const attendees = Array.isArray(body.attendees)
      ? (body.attendees as unknown[]).filter((a): a is string => typeof a === "string")
      : [];
    const createIssues = optionalBool(body.createIssues);

    const result = await processMeetingTranscript({
      companyId,
      transcript,
      eventTitle,
      attendees,
      db,
      createIssues,
    });
    res.json(result);
  });

  /**
   * GET /meetings/upcoming
   * Query params: companyId, days? (default 7)
   * Returns upcoming meetings within the given day window with brief status.
   */
  router.get("/meetings/upcoming", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const daysRaw = Number(req.query.days ?? 7);
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 7;

    const calendarRes = await fetch(
      `${BASE}/google/calendar/events?companyId=${encodeURIComponent(companyId)}`,
    );
    if (!calendarRes.ok) {
      res.status(502).json({
        error: `Failed to fetch calendar events: ${calendarRes.status}`,
      });
      return;
    }

    const calendarData = (await calendarRes.json()) as
      | CalendarEvent[]
      | { items?: CalendarEvent[]; events?: CalendarEvent[] };

    const eventList: CalendarEvent[] = Array.isArray(calendarData)
      ? calendarData
      : (calendarData.items ?? calendarData.events ?? []);

    const now = Date.now();
    const cutoff = now + days * 24 * 60 * 60 * 1000;

    const upcoming = eventList
      .filter((event) => {
        const startRaw = event.start?.dateTime ?? event.start?.date;
        if (!startRaw) return false;
        const ts = new Date(startRaw).getTime();
        return ts >= now && ts <= cutoff;
      })
      .map((event) => ({
        eventId: event.id,
        title: event.summary ?? "Untitled",
        startTime: event.start?.dateTime ?? event.start?.date ?? "",
        attendees: Array.isArray(event.attendees)
          ? event.attendees
              .map((a) => a.displayName ?? a.email ?? "")
              .filter((v) => v.length > 0)
          : [],
        hasBrief: false, // Brief generation is on-demand via GET /meetings/brief
      }))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());

    res.json({ meetings: upcoming, days });
  });

  /**
   * POST /meetings/schedule-brief
   * Body: { companyId, eventId, minutesBefore? }
   * Schedules a pre-meeting brief. Currently generates it immediately and returns it.
   */
  router.post("/meetings/schedule-brief", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    const eventId = requireString(body.eventId, "eventId");
    assertCompanyAccess(req, companyId);

    // minutesBefore is accepted but scheduling is not yet implemented —
    // the brief is generated immediately and returned.
    const minutesBefore =
      typeof body.minutesBefore === "number" && Number.isFinite(body.minutesBefore)
        ? body.minutesBefore
        : 15;

    const brief = await generateMeetingBrief({ companyId, eventId, db });
    res.json({ scheduled: true, minutesBefore, brief });
  });

  return router;
}
