// Register in server/src/app.ts:
// import { audioOverviewRoutes } from "./routes/audio-overviews.js";
// api.use(audioOverviewRoutes(db));

import fs from "node:fs";
import { Router } from "express";
import { type Db } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  createOverviewJob,
  runOverviewJob,
  getJob,
  listJobs,
  isElevenLabsConfigured,
} from "../services/audio-overview.js";

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

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function audioOverviewRoutes(_db: Db) {
  const router = Router();

  // GET /audio-overviews/status — check if ElevenLabs is configured
  // NOTE: This route must be declared before /:jobId to avoid route shadowing.
  router.get("/audio-overviews/status", (req, res) => {
    const companyId = optionalString(req.query.companyId);
    if (companyId) {
      assertCompanyAccess(req, companyId);
    }
    res.json({
      configured: isElevenLabsConfigured(),
      provider: isElevenLabsConfigured() ? "elevenlabs" : null,
    });
  });

  // GET /audio-overviews — list all jobs for a company
  router.get("/audio-overviews", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const jobs = listJobs(companyId);
    res.json(jobs);
  });

  // POST /audio-overviews — create + immediately run a job
  router.post("/audio-overviews", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const sourceType = optionalString(body.sourceType) ?? "text";
    const title = requireString(body.title, "title");
    const content = requireString(body.content, "content");
    const sourceId = optionalString(body.sourceId);

    const job = await createOverviewJob(companyId, sourceType, content, title, sourceId);

    // Run asynchronously — respond immediately with pending job, then run in background
    res.status(202).json(job);

    // Fire-and-forget: run the job pipeline without holding the response
    runOverviewJob(job.id, companyId, content).catch(() => {
      // Errors are persisted to job status; no need to propagate here
    });
  });

  // GET /audio-overviews/:jobId — get job status
  router.get("/audio-overviews/:jobId", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const jobId = requireString(req.params.jobId, "jobId");
    const job = getJob(companyId, jobId);
    if (!job) throw notFound(`Audio overview job ${jobId} not found`);
    res.json(job);
  });

  // GET /audio-overviews/:jobId/audio — stream the audio file
  router.get("/audio-overviews/:jobId/audio", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const jobId = requireString(req.params.jobId, "jobId");
    const job = getJob(companyId, jobId);
    if (!job) throw notFound(`Audio overview job ${jobId} not found`);
    if (job.status !== "complete" || !job.audioFilePath) {
      throw badRequest(
        `Audio is not ready yet. Job status: ${job.status}`,
      );
    }
    if (!fs.existsSync(job.audioFilePath)) {
      throw notFound("Audio file not found on disk");
    }
    res.setHeader("Content-Type", "audio/mpeg");
    const stream = fs.createReadStream(job.audioFilePath);
    stream.pipe(res);
  });

  return router;
}
