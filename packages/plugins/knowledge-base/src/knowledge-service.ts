import { randomUUID } from "node:crypto";
import type { GeneratedDoc, KnowledgeDocument, QueryResult } from "./types.js";

// Optional llamaindex integration — loaded lazily so the plugin works
// without the dependency installed. When absent we fall back to a simple
// keyword search over stored documents.
type LlamaModule = {
  VectorStoreIndex?: unknown;
  Document?: unknown;
};

let llamaindexModule: LlamaModule | null | undefined;

async function tryLoadLlamaIndex(): Promise<LlamaModule | null> {
  if (llamaindexModule !== undefined) return llamaindexModule;
  try {
    // Dynamic import, ignored at typecheck time because the dep is optional.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — llamaindex may not be installed
    llamaindexModule = (await import("llamaindex")) as LlamaModule;
  } catch {
    llamaindexModule = null;
  }
  return llamaindexModule;
}

export interface KnowledgeStore {
  insertIngested(doc: KnowledgeDocument): Promise<void>;
  deleteIngested(companyId: string, docId: string): Promise<boolean>;
  listIngested(companyId: string): Promise<KnowledgeDocument[]>;
  insertGenerated(doc: GeneratedDoc): Promise<void>;
  listGenerated(companyId: string): Promise<GeneratedDoc[]>;
  getGenerated(companyId: string, id: string): Promise<GeneratedDoc | null>;
}

const memoryIngested = new Map<string, KnowledgeDocument>();
const memoryGenerated = new Map<string, GeneratedDoc>();

export const inMemoryKnowledgeStore: KnowledgeStore = {
  async insertIngested(doc) {
    memoryIngested.set(doc.id, doc);
  },
  async deleteIngested(companyId, docId) {
    const existing = memoryIngested.get(docId);
    if (!existing || existing.companyId !== companyId) return false;
    memoryIngested.delete(docId);
    return true;
  },
  async listIngested(companyId) {
    return Array.from(memoryIngested.values())
      .filter((d) => d.companyId === companyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async insertGenerated(doc) {
    memoryGenerated.set(doc.id, doc);
  },
  async listGenerated(companyId) {
    return Array.from(memoryGenerated.values())
      .filter((d) => d.companyId === companyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },
  async getGenerated(companyId, id) {
    const existing = memoryGenerated.get(id);
    if (!existing || existing.companyId !== companyId) return null;
    return existing;
  },
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

function keywordScore(query: string, doc: KnowledgeDocument): number {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return 0;
  const docTokens = tokenize(`${doc.title} ${doc.content}`);
  if (docTokens.length === 0) return 0;
  let hits = 0;
  for (const token of docTokens) {
    if (queryTokens.has(token)) hits += 1;
  }
  return hits / docTokens.length;
}

function excerptFor(content: string, query: string): string {
  const queryTokens = tokenize(query);
  const lower = content.toLowerCase();
  for (const token of queryTokens) {
    const idx = lower.indexOf(token);
    if (idx !== -1) {
      const start = Math.max(0, idx - 80);
      const end = Math.min(content.length, idx + 240);
      return (start > 0 ? "..." : "") + content.slice(start, end) + (end < content.length ? "..." : "");
    }
  }
  return content.slice(0, 280) + (content.length > 280 ? "..." : "");
}

export interface GenerateContext {
  topic?: string;
  audience?: string;
  tone?: string;
  extras?: string;
}

export class KnowledgeService {
  constructor(private store: KnowledgeStore = inMemoryKnowledgeStore) {}

  async ingestDocument(
    companyId: string,
    title: string,
    content: string,
    source: string | null = null,
    docType: string = "general",
  ): Promise<KnowledgeDocument> {
    const doc: KnowledgeDocument = {
      id: randomUUID(),
      companyId,
      title,
      content,
      source,
      docType,
      createdAt: new Date().toISOString(),
    };

    // Best effort: if llamaindex is available, embed the doc into an index.
    // We keep the index in-memory and do not persist it — rebuilt on restart.
    const llama = await tryLoadLlamaIndex();
    if (llama && typeof (llama as { Document?: unknown }).Document === "function") {
      try {
        // No-op for now — when llamaindex is present we still use keyword
        // scoring at query time to remain provider agnostic. This block is
        // here so integrators can wire a real VectorStoreIndex.
      } catch {
        // Ignore embedding errors — fallback to keyword store.
      }
    }

    await this.store.insertIngested(doc);
    return doc;
  }

  async queryKnowledge(companyId: string, query: string, topK = 5): Promise<QueryResult[]> {
    const docs = await this.store.listIngested(companyId);
    const scored = docs
      .map((doc) => ({
        documentId: doc.id,
        title: doc.title,
        score: keywordScore(query, doc),
        excerpt: excerptFor(doc.content, query),
      }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, topK));
    return scored;
  }

  async generateDocument(
    companyId: string,
    docType: string,
    title: string,
    context: GenerateContext | string = {},
  ): Promise<GeneratedDoc> {
    const ctx: GenerateContext =
      typeof context === "string" ? { topic: context } : context ?? {};
    const topic = ctx.topic ?? title;
    const sources = await this.queryKnowledge(companyId, topic, 6);
    const knowledgeBlock =
      sources.length > 0
        ? sources
            .map((s, i) => `### Source ${i + 1}: ${s.title}\n${s.excerpt}`)
            .join("\n\n")
        : "_No relevant knowledge base entries found. Output reflects best-practice defaults._";

    const content = buildDocumentContent(docType, title, ctx, knowledgeBlock);
    const doc: GeneratedDoc = {
      id: randomUUID(),
      companyId,
      title,
      content,
      docType,
      createdAt: new Date().toISOString(),
    };
    await this.store.insertGenerated(doc);
    return doc;
  }

  async listDocuments(companyId: string): Promise<KnowledgeDocument[]> {
    return this.store.listIngested(companyId);
  }

  async listGeneratedDocuments(companyId: string): Promise<GeneratedDoc[]> {
    return this.store.listGenerated(companyId);
  }

  async getGeneratedDocument(companyId: string, id: string): Promise<GeneratedDoc | null> {
    return this.store.getGenerated(companyId, id);
  }

  async deleteDocument(companyId: string, docId: string): Promise<boolean> {
    return this.store.deleteIngested(companyId, docId);
  }
}

function buildDocumentContent(
  docType: string,
  title: string,
  ctx: GenerateContext,
  knowledgeBlock: string,
): string {
  const topic = ctx.topic ?? title;
  const audience = ctx.audience ?? "your customers";
  const tone = ctx.tone ?? "professional and friendly";
  const extras = ctx.extras?.trim() ? `\n\n**Notes:** ${ctx.extras}` : "";

  switch (docType) {
    case "proposal":
      return [
        `# ${title}`,
        "",
        `**Audience:** ${audience}  `,
        `**Tone:** ${tone}`,
        "",
        "## Executive Summary",
        `This proposal outlines how we will deliver ${topic} to meet the needs of ${audience}.`,
        "",
        "## Background",
        knowledgeBlock,
        "",
        "## Scope of Work",
        "- Discovery and requirements gathering",
        "- Implementation milestones",
        "- Acceptance criteria and sign-off",
        "",
        "## Timeline",
        "- Week 1-2: Discovery",
        "- Week 3-6: Implementation",
        "- Week 7: Review and launch",
        "",
        "## Pricing",
        "_To be determined based on final scope._",
        "",
        "## Next Steps",
        "Reply to confirm scope and we will share a signed statement of work." + extras,
      ].join("\n");
    case "sop":
      return [
        `# Standard Operating Procedure: ${title}`,
        "",
        `**Scope:** ${topic}  `,
        `**Audience:** ${audience}`,
        "",
        "## Purpose",
        `Ensure consistent execution of ${topic} across the team.`,
        "",
        "## Reference Material",
        knowledgeBlock,
        "",
        "## Procedure",
        "1. Preparation — gather required inputs and confirm permissions.",
        "2. Execution — follow each step in order, logging decisions as you go.",
        "3. Verification — run the documented checks before marking complete.",
        "4. Handoff — notify stakeholders and file the outcome in the shared record.",
        "",
        "## Exceptions",
        "- Document any deviation and the reason.",
        "- Escalate blocking issues to the team lead.",
        "",
        "## Review Cadence",
        "This SOP should be reviewed quarterly." + extras,
      ].join("\n");
    case "faq":
      return [
        `# ${title}`,
        "",
        `A quick reference for ${audience} about ${topic}.`,
        "",
        "## Source material",
        knowledgeBlock,
        "",
        "## Frequently Asked Questions",
        `### What is ${topic}?`,
        `${topic} is a core offering — see the knowledge excerpts above for full detail.`,
        "",
        `### Who is this for?`,
        `This is aimed at ${audience}.`,
        "",
        `### How do I get started?`,
        `Contact the team or follow the steps outlined in the relevant SOP.`,
        "",
        `### Where can I learn more?`,
        `Review the source material above or reach out for a walkthrough.` + extras,
      ].join("\n");
    case "report":
      return [
        `# ${title}`,
        "",
        `**Subject:** ${topic}  `,
        `**Prepared for:** ${audience}  `,
        `**Tone:** ${tone}`,
        "",
        "## Overview",
        `This report summarises findings related to ${topic}.`,
        "",
        "## Supporting Data",
        knowledgeBlock,
        "",
        "## Key Findings",
        "- Finding 1 — derived from the ingested knowledge base entries above.",
        "- Finding 2 — trends observed in related documents.",
        "- Finding 3 — risks and open questions to investigate further.",
        "",
        "## Recommendations",
        "1. Act on the highest-confidence findings first.",
        "2. Schedule a follow-up review in 30 days.",
        "3. Expand the knowledge base with additional source material." + extras,
      ].join("\n");
    default:
      return [
        `# ${title}`,
        "",
        `## Context`,
        `Generated document covering ${topic} for ${audience}.`,
        "",
        "## Knowledge References",
        knowledgeBlock,
        "",
        "## Draft",
        `Below is a generated draft you can edit before sharing.` + extras,
      ].join("\n");
  }
}
