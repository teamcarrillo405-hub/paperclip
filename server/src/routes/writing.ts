// Register in server/src/app.ts:
// import { writingRoutes } from "./routes/writing.js";
// api.use(writingRoutes(db));   // after googleRoutes line

import fs from "node:fs";
import path from "node:path";
import { Router } from "express";
import { type Db } from "@paperclipai/db";
import { badRequest } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import {
  assembleWritingContext,
  getWritingSystemPrompt,
  type DocumentType,
  type WritingProfile,
} from "../services/writing-context.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

const VALID_TONES = new Set(["formal", "conversational", "technical", "executive"]);
const VALID_LENGTHS = new Set(["concise", "standard", "detailed"]);
const VALID_DOC_TYPES = new Set([
  "email",
  "proposal",
  "memo",
  "report",
  "meeting-summary",
  "social-post",
  "general",
]);

function requireDocType(value: unknown): DocumentType {
  if (typeof value !== "string" || !VALID_DOC_TYPES.has(value)) {
    throw badRequest(
      `docType must be one of: ${[...VALID_DOC_TYPES].join(", ")}`,
    );
  }
  return value as DocumentType;
}

function parseWritingProfile(body: Record<string, unknown>): WritingProfile {
  const tone = body.tone;
  const length = body.length;

  if (!tone || !VALID_TONES.has(tone as string)) {
    throw badRequest(`tone must be one of: ${[...VALID_TONES].join(", ")}`);
  }
  if (!length || !VALID_LENGTHS.has(length as string)) {
    throw badRequest(`length must be one of: ${[...VALID_LENGTHS].join(", ")}`);
  }

  return {
    tone: tone as WritingProfile["tone"],
    length: length as WritingProfile["length"],
    signoffName: optionalString(body.signoffName),
    signoffTitle: optionalString(body.signoffTitle),
  };
}

const DEFAULT_PROFILE: WritingProfile = { tone: "formal", length: "standard" };

// ---------------------------------------------------------------------------
// File-based profile store
// ---------------------------------------------------------------------------

function profilesFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "writing-profiles.json");
}

function loadProfiles(): Record<string, WritingProfile> {
  const filePath = profilesFilePath();
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, WritingProfile>;
    }
    return {};
  } catch {
    return {};
  }
}

function saveProfiles(profiles: Record<string, WritingProfile>): void {
  const filePath = profilesFilePath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(profiles, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

const TEMPLATES = [
  {
    id: "email",
    name: "Business Email",
    description: "Professional email with clear CTA",
  },
  {
    id: "proposal",
    name: "Proposal",
    description: "Structured business proposal",
  },
  {
    id: "memo",
    name: "Internal Memo",
    description: "TO/FROM/DATE/RE formatted memo with action items",
  },
  {
    id: "report",
    name: "Business Report",
    description: "Data-driven report with Overview, Findings, Analysis, Recommendations",
  },
  {
    id: "meeting-summary",
    name: "Meeting Summary",
    description: "Decisions, action items with owners, and open questions",
  },
  {
    id: "social-post",
    name: "Social Media Post",
    description: "Engaging platform-appropriate content with hooks",
  },
  {
    id: "general",
    name: "General Document",
    description: "Professional business writing matched to the requested tone and format",
  },
] as const;

// ---------------------------------------------------------------------------
// Route factory
// ---------------------------------------------------------------------------

export function writingRoutes(db: Db) {
  const router = Router();

  // GET /writing/profiles/:companyId
  // Returns the stored writing profile for a company, or the default profile.
  router.get("/writing/profiles/:companyId", (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const profiles = loadProfiles();
    const profile: WritingProfile = profiles[companyId] ?? DEFAULT_PROFILE;
    res.json(profile);
  });

  // POST /writing/profiles/:companyId
  // Persists a writing profile for a company.
  router.post("/writing/profiles/:companyId", (req, res) => {
    const { companyId } = req.params;
    assertCompanyAccess(req, companyId);
    const body = (req.body ?? {}) as Record<string, unknown>;
    const profile = parseWritingProfile(body);
    const profiles = loadProfiles();
    profiles[companyId] = profile;
    saveProfiles(profiles);
    res.json({ ok: true });
  });

  // POST /writing/context
  // Returns the assembled writing context for an AI agent about to write.
  // Body: { companyId, topic, docType, agentId? }
  router.post("/writing/context", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const topic = requireString(body.topic, "topic");
    const docType = requireDocType(body.docType);

    const profiles = loadProfiles();
    const profile: WritingProfile = profiles[companyId] ?? DEFAULT_PROFILE;

    const context = await assembleWritingContext({ companyId, topic, docType, profile, db });
    res.json(context);
  });

  // POST /writing/generate
  // Returns the assembled system prompt and a ready-to-use fullPrompt for the agent.
  // Body: { companyId, topic, docType, userPrompt, agentId? }
  router.post("/writing/generate", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const topic = requireString(body.topic, "topic");
    const docType = requireDocType(body.docType);
    const userPrompt = requireString(body.userPrompt, "userPrompt");

    const profiles = loadProfiles();
    const profile: WritingProfile = profiles[companyId] ?? DEFAULT_PROFILE;

    const context = await assembleWritingContext({ companyId, topic, docType, profile, db });

    // Build the full prompt the agent will send to its LLM
    const contextSection =
      context.relevantDocs.length > 0
        ? [
            "Relevant company context:",
            "---",
            ...context.relevantDocs.map((doc) => `${doc.title}: ${doc.excerpt}`),
            "---",
          ].join("\n")
        : "";

    const fullPrompt = [
      `Write a ${docType} about: ${userPrompt}`,
      contextSection.length > 0 ? `\n${contextSection}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    res.json({
      systemPrompt: context.systemPrompt,
      contextDocs: context.relevantDocs,
      fullPrompt,
    });
  });

  // GET /writing/templates
  // Returns available document type templates with descriptions.
  router.get("/writing/templates", (_req, res) => {
    res.json(TEMPLATES);
  });

  // Silence unused parameter warning — db is kept in the signature to match
  // the route factory convention and to allow future DB-backed profile storage.
  void db;

  return router;
}

// Re-export types consumed by the service layer for convenience
export type { WritingProfile, DocumentType, WritingContext } from "../services/writing-context.js";
