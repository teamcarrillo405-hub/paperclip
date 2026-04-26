import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotebookSource = {
  id: string;
  companyId: string;
  notebookId: string;
  type: "text" | "url" | "pdf" | "drive-doc";
  title: string;
  content: string;
  sourceUrl?: string;
  wordCount: number;
  createdAt: string;
};

export type NotebookQueryResult = {
  answer: string;
  citations: Array<{
    sourceId: string;
    sourceTitle: string;
    excerpt: string;
    relevanceScore: number;
  }>;
  sourcesUsed: number;
};

export type Notebook = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  sourceCount: number;
  createdAt: string;
  updatedAt: string;
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function notebooksDir(companyId: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "notebooks", companyId);
}

function notebookFilePath(companyId: string, notebookId: string): string {
  return path.resolve(notebooksDir(companyId), `${notebookId}.json`);
}

function sourcesDir(companyId: string, notebookId: string): string {
  return path.resolve(notebooksDir(companyId), notebookId, "sources");
}

function sourceFilePath(companyId: string, notebookId: string, sourceId: string): string {
  return path.resolve(sourcesDir(companyId, notebookId), `${sourceId}.json`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(filePath: string, data: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf-8");
}

function newId(): string {
  return crypto.randomUUID();
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ---------------------------------------------------------------------------
// URL content fetching
// ---------------------------------------------------------------------------

export async function fetchUrlContent(url: string): Promise<string> {
  if (url.toLowerCase().endsWith(".pdf") || url.toLowerCase().includes(".pdf?")) {
    return "PDF extraction not supported for remote URLs, please paste content manually";
  }

  const response = await fetch(url);
  const html = await response.text();

  // Remove script and style blocks entirely
  let text = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ");
  text = text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ");
  // Strip remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");
  // Decode common HTML entities
  text = text
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, " ");
  // Collapse whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

// ---------------------------------------------------------------------------
// Notebook CRUD
// ---------------------------------------------------------------------------

export function createNotebook(companyId: string, name: string, description?: string): Notebook {
  const id = newId();
  const now = new Date().toISOString();
  const notebook: Notebook = {
    id,
    companyId,
    name,
    description,
    sourceCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  ensureDir(notebooksDir(companyId));
  writeJson(notebookFilePath(companyId, id), notebook);
  return notebook;
}

export function listNotebooks(companyId: string): Notebook[] {
  const dir = notebooksDir(companyId);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const notebooks: Notebook[] = [];
  for (const file of files) {
    const nb = readJson<Notebook>(path.resolve(dir, file));
    if (nb) notebooks.push(nb);
  }
  return notebooks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getNotebook(companyId: string, notebookId: string): Notebook | null {
  return readJson<Notebook>(notebookFilePath(companyId, notebookId));
}

export function deleteNotebook(companyId: string, notebookId: string): void {
  const filePath = notebookFilePath(companyId, notebookId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  const srcDir = sourcesDir(companyId, notebookId);
  if (fs.existsSync(srcDir)) {
    fs.rmSync(srcDir, { recursive: true, force: true });
  }
  // Remove the notebook's sub-directory if it exists
  const notebookSubDir = path.resolve(notebooksDir(companyId), notebookId);
  if (fs.existsSync(notebookSubDir)) {
    fs.rmSync(notebookSubDir, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Source CRUD
// ---------------------------------------------------------------------------

function refreshNotebookSourceCount(companyId: string, notebookId: string): void {
  const nb = getNotebook(companyId, notebookId);
  if (!nb) return;
  const sources = listSources(companyId, notebookId);
  nb.sourceCount = sources.length;
  nb.updatedAt = new Date().toISOString();
  writeJson(notebookFilePath(companyId, notebookId), nb);
}

export function addSource(
  companyId: string,
  notebookId: string,
  source: Omit<NotebookSource, "id" | "createdAt" | "wordCount">,
): NotebookSource {
  const id = newId();
  const now = new Date().toISOString();
  const full: NotebookSource = {
    ...source,
    id,
    createdAt: now,
    wordCount: countWords(source.content),
  };
  ensureDir(sourcesDir(companyId, notebookId));
  writeJson(sourceFilePath(companyId, notebookId, id), full);
  refreshNotebookSourceCount(companyId, notebookId);
  return full;
}

export function listSources(companyId: string, notebookId: string): NotebookSource[] {
  const dir = sourcesDir(companyId, notebookId);
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
  const sources: NotebookSource[] = [];
  for (const file of files) {
    const src = readJson<NotebookSource>(path.resolve(dir, file));
    if (src) sources.push(src);
  }
  return sources.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function removeSource(companyId: string, notebookId: string, sourceId: string): void {
  const filePath = sourceFilePath(companyId, notebookId, sourceId);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  refreshNotebookSourceCount(companyId, notebookId);
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

function scoreRelevance(content: string, question: string): number {
  const words = question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const lowerContent = content.toLowerCase();
  return words.reduce((acc, word) => {
    const idx = lowerContent.indexOf(word);
    return idx !== -1 ? acc + 1 : acc;
  }, 0);
}

function extractExcerpt(content: string, question: string, maxLen = 500): string {
  const words = question
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const lowerContent = content.toLowerCase();
  let bestIdx = -1;
  for (const word of words) {
    const idx = lowerContent.indexOf(word);
    if (idx !== -1) {
      bestIdx = idx;
      break;
    }
  }
  if (bestIdx === -1) return content.slice(0, maxLen);
  const start = Math.max(0, bestIdx - 100);
  return content.slice(start, start + maxLen);
}

export async function queryNotebook(
  companyId: string,
  notebookId: string,
  question: string,
): Promise<NotebookQueryResult> {
  const sources = listSources(companyId, notebookId);
  if (sources.length === 0) {
    return {
      answer: "This notebook has no sources. Please add sources before querying.",
      citations: [],
      sourcesUsed: 0,
    };
  }

  // Score and rank sources
  const scored = sources
    .map((src) => ({
      src,
      score: scoreRelevance(src.content, question),
      excerpt: extractExcerpt(src.content, question),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  const sourcesBlock = scored
    .map((item, i) => `Source ${i + 1} — ${item.src.title}:\n${item.excerpt}`)
    .join("\n\n");

  const promptText = `Based on these sources, answer: ${question}\n\nSources:\n${sourcesBlock}`;

  const port = process.env.PORT ?? "3100";
  const generateResponse = await fetch(`http://localhost:${port}/api/knowledge/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      companyId,
      docType: "general",
      title: question,
      context: promptText,
    }),
  });

  let answer = "Unable to generate answer.";
  if (generateResponse.ok) {
    const generated = (await generateResponse.json()) as { content?: string; title?: string };
    answer = generated.content ?? generated.title ?? answer;
  }

  return {
    answer,
    citations: scored.map((item) => ({
      sourceId: item.src.id,
      sourceTitle: item.src.title,
      excerpt: item.excerpt,
      relevanceScore: item.score,
    })),
    sourcesUsed: scored.length,
  };
}
