import fs from "node:fs";
import path from "node:path";
import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { VideoService } from "@paperclipai/plugin-video";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { assertCompanyAccess } from "./authz.js";

const compositionIds = [
  "WeeklyReport",
  "SocialPost",
  "Proposal",
  "OnboardingDemo",
] as const;

const renderBodySchema = z.object({
  companyId: z.string().min(1).optional(),
  compositionId: z.enum(compositionIds),
  props: z.record(z.unknown()),
});

function resolveCompanyId(req: Request, fallback?: string): string | null {
  if (fallback) return fallback;
  if (req.actor.type === "agent" && req.actor.companyId) {
    return req.actor.companyId;
  }
  if (req.actor.type === "board") {
    const explicit = (req.query.companyId ?? req.query.company_id) as unknown;
    if (typeof explicit === "string" && explicit.length > 0) return explicit;
    const fromList = Array.isArray(req.actor.companyIds)
      ? req.actor.companyIds[0]
      : undefined;
    if (fromList) return fromList;
  }
  return null;
}

let cachedService: VideoService | null = null;
function videoServiceInstance(db: Db): VideoService {
  if (!cachedService) {
    cachedService = new VideoService(db);
  }
  return cachedService;
}

export function videoRoutes(db: Db) {
  const router = Router();

  router.post(
    "/video/render",
    validate(renderBodySchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof renderBodySchema>;
      const companyId = resolveCompanyId(req, body.companyId);
      if (!companyId) {
        throw badRequest("companyId could not be resolved from the request");
      }
      assertCompanyAccess(req, companyId);

      const service = videoServiceInstance(db);
      try {
        let result;
        switch (body.compositionId) {
          case "WeeklyReport":
            result = await service.renderWeeklyReport(companyId, body.props as never);
            break;
          case "SocialPost":
            result = await service.renderSocialPost(companyId, body.props as never);
            break;
          case "Proposal":
            result = await service.renderProposal(companyId, body.props as never);
            break;
          case "OnboardingDemo":
            result = await service.renderOnboardingDemo(companyId, body.props as never);
            break;
        }
        res.json(result);
      } catch (err) {
        logger.error({ err }, "video: render enqueue failed");
        throw err;
      }
    },
  );

  router.get("/video/jobs", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      throw badRequest("companyId could not be resolved from the request");
    }
    assertCompanyAccess(req, companyId);

    const limit = Number.isFinite(Number(req.query.limit))
      ? Math.min(Math.max(Number(req.query.limit), 1), 100)
      : 20;
    const service = videoServiceInstance(db);
    const jobs = await service.listJobs(companyId, limit);
    res.json({ jobs });
  });

  router.get("/video/jobs/:jobId", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      throw badRequest("companyId could not be resolved from the request");
    }
    assertCompanyAccess(req, companyId);

    const service = videoServiceInstance(db);
    const job = await service.getJobForCompany(companyId, req.params.jobId);
    if (!job) throw notFound("video job not found");

    const downloadUrl =
      job.status === "completed" && job.outputPath
        ? `/api/video/download/${job.id}`
        : null;
    res.json({ ...job, downloadUrl });
  });

  router.get("/video/download/:jobId", async (req, res, next) => {
    try {
      const companyId = resolveCompanyId(req);
      if (!companyId) {
        throw badRequest("companyId could not be resolved from the request");
      }
      assertCompanyAccess(req, companyId);

      const service = videoServiceInstance(db);
      const job = await service.getJobForCompany(companyId, req.params.jobId);
      if (!job) throw notFound("video job not found");
      if (!job.outputPath) throw notFound("video not yet rendered");

      const absolute = path.resolve(job.outputPath);
      if (!fs.existsSync(absolute)) throw notFound("video file missing on disk");

      res.setHeader("Content-Type", "video/mp4");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${job.compositionId}-${job.id}.mp4"`,
      );
      fs.createReadStream(absolute)
        .on("error", (err) => {
          logger.error({ err }, "video: stream failed");
          next(err);
        })
        .pipe(res);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
