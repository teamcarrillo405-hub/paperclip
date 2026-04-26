import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type AudioOverviewJob = {
  id: string;
  companyId: string;
  sourceType: "notebook" | "kb-document" | "text";
  sourceId?: string;
  title: string;
  script: string;
  audioFilePath?: string;
  status: "pending" | "generating-script" | "generating-audio" | "complete" | "error";
  errorMessage?: string;
  durationSeconds?: number;
  createdAt: string;
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function audioOverviewsDir(companyId: string): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "audio-overviews", companyId);
}

function jobsFilePath(companyId: string): string {
  return path.resolve(audioOverviewsDir(companyId), "jobs.json");
}

function audioDir(companyId: string): string {
  return path.resolve(audioOverviewsDir(companyId), "audio");
}

function audioFilePath(companyId: string, jobId: string): string {
  return path.resolve(audioDir(companyId), `${jobId}.mp3`);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

function loadJobs(companyId: string): AudioOverviewJob[] {
  const filePath = jobsFilePath(companyId);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as AudioOverviewJob[];
  } catch {
    return [];
  }
}

function saveJobs(companyId: string, jobs: AudioOverviewJob[]): void {
  ensureDir(audioOverviewsDir(companyId));
  fs.writeFileSync(jobsFilePath(companyId), JSON.stringify(jobs, null, 2), "utf-8");
}

function updateJob(companyId: string, jobId: string, patch: Partial<AudioOverviewJob>): void {
  const jobs = loadJobs(companyId);
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx === -1) return;
  jobs[idx] = { ...jobs[idx], ...patch } as AudioOverviewJob;
  saveJobs(companyId, jobs);
}

function newId(): string {
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Script generation
// ---------------------------------------------------------------------------

export function generateOverviewScript(content: string, title: string): string {
  // Truncate very long content to a workable size before summarising
  const truncated = content.length > 6000 ? content.slice(0, 6000) + "..." : content;

  // Extract simple sentences for key takeaways (first ~3 sentences)
  const sentences = truncated
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 30)
    .slice(0, 3);

  const takeaways = sentences.map((s, i) => `${i + 1}. ${s}.`).join(" ");

  // Build the conversational script, keeping it under ~500 words
  const intro = `Welcome to your Avero briefing on ${title}.`;
  const body = truncated.slice(0, 1500).replace(/\s+/g, " ").trim();
  const outro = `Key takeaways: ${takeaways} That's your briefing on ${title}.`;

  return `${intro} ${body} ${outro}`;
}

// ---------------------------------------------------------------------------
// ElevenLabs audio generation
// ---------------------------------------------------------------------------

export function isElevenLabsConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

export async function generateAudioWithElevenLabs(
  script: string,
  jobId: string,
  companyId: string,
): Promise<string> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not configured");
  }
  const voiceId =
    process.env.ELEVENLABS_DEFAULT_VOICE_ID ?? "21m00Tcm4TlvDq8ikWAM";

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: script,
        model_id: "eleven_monolingual_v1",
        voice_settings: { stability: 0.5, similarity_boost: 0.5 },
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(`ElevenLabs API error ${response.status}: ${errorText}`);
  }

  const outDir = audioDir(companyId);
  ensureDir(outDir);
  const outPath = audioFilePath(companyId, jobId);

  const arrayBuffer = await response.arrayBuffer();
  fs.writeFileSync(outPath, Buffer.from(arrayBuffer));

  return outPath;
}

// ---------------------------------------------------------------------------
// Job management
// ---------------------------------------------------------------------------

export function listJobs(companyId: string): AudioOverviewJob[] {
  return loadJobs(companyId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getJob(companyId: string, jobId: string): AudioOverviewJob | null {
  const jobs = loadJobs(companyId);
  return jobs.find((j) => j.id === jobId) ?? null;
}

export async function createOverviewJob(
  companyId: string,
  sourceType: string,
  content: string,
  title: string,
  sourceId?: string,
): Promise<AudioOverviewJob> {
  const id = newId();
  const now = new Date().toISOString();

  const validSourceType =
    sourceType === "notebook" || sourceType === "kb-document" || sourceType === "text"
      ? (sourceType as AudioOverviewJob["sourceType"])
      : "text";

  const job: AudioOverviewJob = {
    id,
    companyId,
    sourceType: validSourceType,
    sourceId,
    title,
    script: "",
    status: "pending",
    createdAt: now,
  };

  ensureDir(audioOverviewsDir(companyId));
  const jobs = loadJobs(companyId);
  jobs.push(job);
  saveJobs(companyId, jobs);

  return job;
}

export async function runOverviewJob(jobId: string, companyId: string, content: string): Promise<void> {
  const job = getJob(companyId, jobId);
  if (!job) throw new Error(`Job ${jobId} not found`);

  try {
    // Generate script
    updateJob(companyId, jobId, { status: "generating-script" });
    const script = generateOverviewScript(content, job.title);
    updateJob(companyId, jobId, { script, status: "generating-audio" });

    // Generate audio
    const filePath = await generateAudioWithElevenLabs(script, jobId, companyId);

    updateJob(companyId, jobId, {
      audioFilePath: filePath,
      status: "complete",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateJob(companyId, jobId, { status: "error", errorMessage: message });
    throw err;
  }
}
