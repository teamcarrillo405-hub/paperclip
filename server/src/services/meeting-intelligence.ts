import type { Db } from "@paperclipai/db";

const PORT = process.env.PORT ?? "3100";
const BASE = `http://localhost:${PORT}/api`;

export type MeetingBrief = {
  eventId: string;
  title: string;
  startTime: string;
  attendees: string[];
  agenda: string;
  relevantIssues: Array<{ id: string; title: string }>;
  briefDoc?: { docId: string; url: string };
};

export type MeetingTranscriptResult = {
  summary: string;
  decisions: string[];
  actionItems: Array<{ description: string; owner?: string; dueDate?: string }>;
  issuesCreated: Array<{ id: string; title: string }>;
};

type CalendarEvent = {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string }>;
  description?: string;
};

type KnowledgeQueryResult = {
  results: Array<{ id: string; title: string; content: string }>;
};

type IssueListResult = {
  issues?: Array<{ id: string; title: string; status?: string }>;
  data?: Array<{ id: string; title: string; status?: string }>;
};

type GoogleDocsCreateResult = {
  docId?: string;
  documentId?: string;
  url?: string;
  webViewLink?: string;
};

type GeneratedDocResult = {
  content?: string;
  id?: string;
};

type IssueCreateResult = {
  id: string;
  title: string;
};

function extractAttendeesFromEvent(event: CalendarEvent): string[] {
  if (!Array.isArray(event.attendees)) return [];
  return event.attendees
    .map((a) => a.displayName ?? a.email ?? "")
    .filter((v) => v.length > 0);
}

function extractAgenda(event: CalendarEvent): string {
  return event.description ?? "";
}

/**
 * Generate a pre-meeting brief by assembling calendar event data, relevant
 * knowledge-base results, and open company issues.
 */
export async function generateMeetingBrief(params: {
  companyId: string;
  eventId: string;
  db: Db;
  createDoc?: boolean;
}): Promise<MeetingBrief> {
  const { companyId, eventId, createDoc } = params;

  // 1. Fetch calendar events and find the target event.
  const calendarRes = await fetch(
    `${BASE}/google/calendar/events?companyId=${encodeURIComponent(companyId)}`,
  );
  if (!calendarRes.ok) {
    throw new Error(
      `Failed to fetch calendar events: ${calendarRes.status} ${await calendarRes.text()}`,
    );
  }
  const calendarData = (await calendarRes.json()) as
    | CalendarEvent[]
    | { items?: CalendarEvent[]; events?: CalendarEvent[] };

  const eventList: CalendarEvent[] = Array.isArray(calendarData)
    ? calendarData
    : (calendarData.items ?? calendarData.events ?? []);

  const event = eventList.find((e) => e.id === eventId);
  if (!event) {
    throw new Error(`Event ${eventId} not found in calendar`);
  }

  const title = event.summary ?? "Untitled Meeting";
  const startTime =
    event.start?.dateTime ?? event.start?.date ?? new Date().toISOString();
  const attendees = extractAttendeesFromEvent(event);
  const agenda = extractAgenda(event);

  // 2. Query the knowledge base with the meeting title.
  const kbRes = await fetch(`${BASE}/knowledge/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyId, query: title, topK: 3 }),
  });
  const kbData: KnowledgeQueryResult = kbRes.ok
    ? ((await kbRes.json()) as KnowledgeQueryResult)
    : { results: [] };

  // 3. Fetch open issues for the company.
  const issuesRes = await fetch(
    `${BASE}/companies/${encodeURIComponent(companyId)}/issues?status=open&limit=5`,
  );
  const issuesData: IssueListResult = issuesRes.ok
    ? ((await issuesRes.json()) as IssueListResult)
    : {};

  const rawIssues = issuesData.issues ?? issuesData.data ?? [];
  const relevantIssues = rawIssues.map((issue) => ({
    id: issue.id,
    title: issue.title,
  }));

  // 4. Optionally create a Google Doc brief.
  let briefDoc: { docId: string; url: string } | undefined;
  if (createDoc) {
    const docContent = [
      `# Pre-Meeting Brief: ${title}`,
      `**Time:** ${startTime}`,
      `**Attendees:** ${attendees.join(", ") || "N/A"}`,
      agenda ? `\n## Agenda\n${agenda}` : "",
      relevantIssues.length > 0
        ? `\n## Open Issues\n${relevantIssues.map((i) => `- [${i.id}] ${i.title}`).join("\n")}`
        : "",
      kbData.results.length > 0
        ? `\n## Relevant Knowledge\n${kbData.results.map((r) => `- ${r.title}`).join("\n")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");

    const docRes = await fetch(`${BASE}/google/docs/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, title: `Brief: ${title}`, content: docContent }),
    });
    if (docRes.ok) {
      const docData = (await docRes.json()) as GoogleDocsCreateResult;
      const docId = docData.docId ?? docData.documentId ?? "";
      const url = docData.url ?? docData.webViewLink ?? "";
      if (docId) {
        briefDoc = { docId, url };
      }
    }
  }

  return {
    eventId,
    title,
    startTime,
    attendees,
    agenda,
    relevantIssues,
    ...(briefDoc ? { briefDoc } : {}),
  };
}

// ---------------------------------------------------------------------------
// Action-item extraction helpers
// ---------------------------------------------------------------------------

const ACTION_ITEM_PATTERNS = [
  /^action\s+item[s]?\s*[:\-]\s*/i,
  /^todo[:\-]\s*/i,
  /^\[\s*\]\s+/,
  /^\d+\.\s+/,
];

const OWNER_PATTERN = /\(([^)]+)\)/;
const DUE_DATE_PATTERN = /\bby\s+([A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{4}-\d{2}-\d{2})/i;

function isActionItemLine(line: string): boolean {
  return ACTION_ITEM_PATTERNS.some((re) => re.test(line.trim()));
}

function parseActionItemLine(raw: string): {
  description: string;
  owner?: string;
  dueDate?: string;
} {
  let line = raw.trim();
  // Strip leading markers
  for (const pattern of ACTION_ITEM_PATTERNS) {
    line = line.replace(pattern, "");
  }
  line = line.trim();

  const ownerMatch = OWNER_PATTERN.exec(line);
  const owner = ownerMatch ? ownerMatch[1].trim() : undefined;
  if (ownerMatch) {
    line = line.replace(ownerMatch[0], "").trim();
  }

  const dueDateMatch = DUE_DATE_PATTERN.exec(line);
  const dueDate = dueDateMatch ? dueDateMatch[1].trim() : undefined;
  if (dueDateMatch) {
    line = line.replace(dueDateMatch[0], "").trim();
  }

  return {
    description: line || raw.trim(),
    ...(owner ? { owner } : {}),
    ...(dueDate ? { dueDate } : {}),
  };
}

function extractActionItemsFromText(text: string): Array<{
  description: string;
  owner?: string;
  dueDate?: string;
}> {
  const lines = text.split("\n");
  const items: Array<{ description: string; owner?: string; dueDate?: string }> = [];

  let inActionItemsSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Detect a section header
    if (/^#{1,4}\s*action\s+items?/i.test(line)) {
      inActionItemsSection = true;
      continue;
    }
    // Any new top-level header ends the section
    if (inActionItemsSection && /^#{1,4}\s+/.test(line)) {
      inActionItemsSection = false;
    }

    if (inActionItemsSection) {
      // In the action-items section treat bullet lines as items
      if (/^[-*]\s+/.test(line)) {
        const stripped = line.replace(/^[-*]\s+/, "");
        items.push(parseActionItemLine(stripped));
      } else if (/^\d+\.\s+/.test(line)) {
        items.push(parseActionItemLine(line));
      }
    } else if (isActionItemLine(line)) {
      items.push(parseActionItemLine(line));
    }
  }
  return items;
}

function extractDecisionsFromText(text: string): string[] {
  const lines = text.split("\n");
  const decisions: string[] = [];
  let inDecisionsSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (/^#{1,4}\s*decisions?/i.test(line)) {
      inDecisionsSection = true;
      continue;
    }
    if (inDecisionsSection && /^#{1,4}\s+/.test(line)) {
      inDecisionsSection = false;
    }
    if (inDecisionsSection && /^[-*\d]/.test(line)) {
      decisions.push(line.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, ""));
    }
  }
  return decisions;
}

/**
 * Process a raw meeting transcript: summarize it via the knowledge base
 * generate endpoint, extract action items, and optionally create issues.
 */
export async function processMeetingTranscript(params: {
  companyId: string;
  transcript: string;
  eventTitle: string;
  attendees: string[];
  db: Db;
  createIssues: boolean;
}): Promise<MeetingTranscriptResult> {
  const { companyId, transcript, eventTitle, attendees, createIssues } = params;

  // 1. Generate a structured summary via the knowledge base.
  const generateRes = await fetch(`${BASE}/knowledge/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      docType: "meeting-summary",
      title: eventTitle,
      context: transcript,
    }),
  });

  let generatedContent = "";
  if (generateRes.ok) {
    const generated = (await generateRes.json()) as GeneratedDocResult;
    generatedContent = generated.content ?? "";
  } else {
    // Fallback: use the raw transcript as the basis for parsing
    generatedContent = transcript;
  }

  // 2. Extract structured data from the generated content.
  const actionItems = extractActionItemsFromText(generatedContent);
  const decisions = extractDecisionsFromText(generatedContent);

  // Extract summary: first non-heading paragraph
  const summaryMatch = generatedContent
    .split("\n")
    .filter((l) => l.trim() && !/^#/.test(l.trim()))
    .slice(0, 3)
    .join(" ");
  const summary = summaryMatch || generatedContent.slice(0, 500);

  // 3. Optionally create issues for each action item.
  const issuesCreated: Array<{ id: string; title: string }> = [];
  if (createIssues && actionItems.length > 0) {
    for (const item of actionItems) {
      try {
        const issueRes = await fetch(
          `${BASE}/companies/${encodeURIComponent(companyId)}/issues`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              title: item.description.slice(0, 200),
              description: [
                `**Source:** Meeting transcript — ${eventTitle}`,
                attendees.length > 0
                  ? `**Attendees:** ${attendees.join(", ")}`
                  : "",
                item.owner ? `**Owner:** ${item.owner}` : "",
                item.dueDate ? `**Due:** ${item.dueDate}` : "",
              ]
                .filter(Boolean)
                .join("\n"),
              status: "backlog",
              priority: "medium",
            }),
          },
        );
        if (issueRes.ok) {
          const created = (await issueRes.json()) as IssueCreateResult;
          issuesCreated.push({ id: created.id, title: created.title });
        }
      } catch {
        // Individual issue creation failure should not abort the whole result
      }
    }
  }

  return {
    summary,
    decisions,
    actionItems,
    issuesCreated,
  };
}
