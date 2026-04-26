import { type Db } from "@paperclipai/db";

export type WritingProfile = {
  tone: "formal" | "conversational" | "technical" | "executive";
  length: "concise" | "standard" | "detailed";
  signoffName?: string;
  signoffTitle?: string;
};

export type DocumentType =
  | "email"
  | "proposal"
  | "memo"
  | "report"
  | "meeting-summary"
  | "social-post"
  | "general";

export type WritingContext = {
  profile: WritingProfile;
  docType: DocumentType;
  topic: string;
  relevantDocs: Array<{ title: string; excerpt: string }>;
  systemPrompt: string;
};

export function getWritingSystemPrompt(docType: DocumentType, profile: WritingProfile): string {
  const tone = profile.tone;
  const signoffName = profile.signoffName ?? "The Team";
  const signoffTitle = profile.signoffTitle ?? "";

  switch (docType) {
    case "email":
      return [
        `You are a professional business email writer.`,
        `Write clear, actionable emails.`,
        `Lead with the key ask.`,
        `Use ${tone} tone.`,
        `End with a clear CTA.`,
        signoffTitle
          ? `Sign off as ${signoffName}, ${signoffTitle}.`
          : `Sign off as ${signoffName}.`,
      ].join(" ");

    case "proposal":
      return [
        `You are an expert proposal writer.`,
        `Structure: Executive Summary → Problem → Solution → Timeline → Pricing → Next Steps.`,
        `Use persuasive but factual language.`,
        `Tone: ${tone}.`,
      ].join(" ");

    case "memo":
      return [
        `You are writing an internal business memo.`,
        `Format: TO/FROM/DATE/RE header, then body.`,
        `Be direct and structured with clear action items.`,
        `Tone: ${tone}.`,
      ].join(" ");

    case "report":
      return [
        `You are writing a business report.`,
        `Use data-driven language.`,
        `Include sections: Overview, Key Findings, Analysis, Recommendations.`,
        `Tone: ${tone}.`,
      ].join(" ");

    case "meeting-summary":
      return [
        `You are summarizing a business meeting.`,
        `Extract: attendees, decisions made, action items (each with owner and due date), open questions.`,
        `Tone: ${tone}.`,
      ].join(" ");

    case "social-post":
      return [
        `You are a social media copywriter.`,
        `Write engaging, platform-appropriate content.`,
        `No corporate jargon.`,
        `Use hooks.`,
        `Tone: ${tone}.`,
      ].join(" ");

    case "general":
    default:
      return [
        `You are a professional business writer.`,
        `Match the requested tone and format.`,
        `Tone: ${tone}.`,
      ].join(" ");
  }
}

type KbQueryResult = {
  results: Array<{
    title?: string;
    content?: string;
    excerpt?: string;
    score?: number;
  }>;
};

export async function assembleWritingContext(params: {
  companyId: string;
  topic: string;
  docType: DocumentType;
  profile: WritingProfile;
  db: Db;
}): Promise<WritingContext> {
  const { companyId, topic, docType, profile } = params;

  const systemPrompt = getWritingSystemPrompt(docType, profile);

  let relevantDocs: Array<{ title: string; excerpt: string }> = [];

  try {
    const port = process.env.PORT ?? "3100";
    const url = `http://localhost:${port}/api/knowledge/query`;

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, query: topic, topK: 3 }),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      const data = (await response.json()) as KbQueryResult;
      if (Array.isArray(data.results)) {
        relevantDocs = data.results.map((r) => ({
          title: typeof r.title === "string" && r.title.length > 0 ? r.title : "Untitled",
          excerpt:
            typeof r.excerpt === "string" && r.excerpt.length > 0
              ? r.excerpt
              : typeof r.content === "string"
                ? r.content.slice(0, 300)
                : "",
        }));
      }
    }
  } catch {
    // KB query is best-effort; writing proceeds without context if it fails
    relevantDocs = [];
  }

  return {
    profile,
    docType,
    topic,
    relevantDocs,
    systemPrompt,
  };
}
