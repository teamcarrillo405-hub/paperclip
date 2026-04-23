import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { ImageService, type ImageStyle } from "@paperclipai/plugin-image-studio";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { assertCompanyAccess } from "./authz.js";

const STYLES = [
  "photorealistic",
  "illustration",
  "logo",
  "social-post",
  "product",
  "banner",
] as const;

const generateBodySchema = z.object({
  companyId: z.string().min(1).optional(),
  prompt: z.string().min(1),
  style: z.enum(STYLES).optional(),
  width: z.number().int().positive().max(2048).optional(),
  height: z.number().int().positive().max(2048).optional(),
  negativePrompt: z.string().optional(),
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

let cachedService: ImageService | null = null;
function imageServiceInstance(db: Db): ImageService {
  if (!cachedService) {
    cachedService = new ImageService(db);
  }
  return cachedService;
}

const STYLE_METADATA: Array<{ id: ImageStyle; label: string; description: string }> = [
  { id: "photorealistic", label: "Photorealistic", description: "Realistic photo-quality image with natural lighting." },
  { id: "illustration", label: "Illustration", description: "Modern digital illustration with clean lines and vibrant colors." },
  { id: "logo", label: "Logo", description: "Professional vector-style business logo, clean and minimal." },
  { id: "social-post", label: "Social Post", description: "Eye-catching square image for social media feeds." },
  { id: "product", label: "Product", description: "Clean product photography on a white studio background." },
  { id: "banner", label: "Banner", description: "Wide marketing banner for website headers and ads." },
];

export function imageStudioRoutes(db: Db) {
  const router = Router();

  router.post(
    "/images/generate",
    validate(generateBodySchema),
    async (req, res) => {
      const body = req.body as z.infer<typeof generateBodySchema>;
      const companyId = resolveCompanyId(req, body.companyId);
      if (!companyId) {
        throw badRequest("companyId could not be resolved from the request");
      }
      assertCompanyAccess(req, companyId);

      const service = imageServiceInstance(db);
      try {
        const job = await service.generateImage(companyId, {
          prompt: body.prompt,
          style: body.style,
          width: body.width,
          height: body.height,
          negativePrompt: body.negativePrompt,
        });
        res.json({
          jobId: job.id,
          status: job.status,
          imageUrl: job.imageUrl,
          provider: job.provider,
        });
      } catch (err) {
        logger.error({ err }, "image-studio: generate failed");
        throw err;
      }
    },
  );

  router.get("/images/jobs", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      throw badRequest("companyId could not be resolved from the request");
    }
    assertCompanyAccess(req, companyId);

    const limit = Number.isFinite(Number(req.query.limit))
      ? Math.min(Math.max(Number(req.query.limit), 1), 100)
      : 20;
    const service = imageServiceInstance(db);
    const jobs = await service.listJobs(companyId, limit);
    res.json({ jobs });
  });

  router.get("/images/jobs/:jobId", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) {
      throw badRequest("companyId could not be resolved from the request");
    }
    assertCompanyAccess(req, companyId);

    const service = imageServiceInstance(db);
    const job = await service.getJobStatus(req.params.jobId);
    if (!job || job.companyId !== companyId) {
      throw notFound("image job not found");
    }
    res.json(job);
  });

  router.get("/images/styles", async (_req, res) => {
    const service = imageServiceInstance(db);
    res.json({
      provider: service.getProvider(),
      styles: STYLE_METADATA,
    });
  });

  return router;
}
