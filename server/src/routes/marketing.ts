import { Router, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import {
  marketingCampaigns,
  type Db,
  type MarketingCampaignAssets,
  type MarketingCampaignStatus,
} from "@paperclipai/db";
import { WondaService } from "@paperclipai/plugin-wonda";
import { validate } from "../middleware/validate.js";
import { badRequest, notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { assertCompanyAccess } from "./authz.js";

const PLATFORM_VALUES = [
  "instagram",
  "linkedin",
  "x",
  "twitter",
  "reddit",
  "tiktok",
  "facebook",
  "youtube",
] as const;
const platformSchema = z.enum(PLATFORM_VALUES);

const TONE_VALUES = [
  "professional",
  "casual",
  "exciting",
  "informative",
  "playful",
  "bold",
] as const;
const toneSchema = z.enum(TONE_VALUES);

const createCampaignSchema = z.object({
  companyId: z.string().min(1),
  name: z.string().min(1),
  topic: z.string().min(1),
  platforms: z.array(platformSchema).min(1),
  tone: toneSchema.optional(),
});

const publishCampaignSchema = z.object({
  platforms: z.array(platformSchema).optional(),
  scheduledAt: z.string().optional(),
});

function resolveCompanyId(req: Request): string | null {
  if (req.actor.type === "agent" && req.actor.companyId) {
    return req.actor.companyId;
  }
  if (req.actor.type === "board") {
    const explicit = (req.query.companyId ?? req.query.company_id) as unknown;
    if (typeof explicit === "string" && explicit.length > 0) return explicit;
    const fromList = Array.isArray(req.actor.companyIds) ? req.actor.companyIds[0] : undefined;
    if (fromList) return fromList;
  }
  return null;
}

let cachedService: WondaService | null = null;
function wondaServiceInstance(): WondaService {
  if (!cachedService) {
    cachedService = new WondaService({
      env: {
        WONDA_API_KEY: process.env.WONDA_API_KEY,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      },
    });
  }
  return cachedService;
}

export function marketingRoutes(db: Db) {
  const router = Router();

  /** GET /api/marketing/status — whether the wonda CLI is installed. */
  router.get("/marketing/status", async (_req, res) => {
    try {
      const availability = await wondaServiceInstance().checkAvailability(true);
      res.json({
        installed: availability.installed,
        version: availability.version,
        binaryPath: availability.binaryPath,
        setupInstructions: availability.installed ? undefined : availability.setupInstructions,
      });
    } catch (err) {
      logger.error({ err }, "marketing: wonda availability probe failed");
      res.status(500).json({ installed: false, error: "failed to probe wonda CLI" });
    }
  });

  router.get("/marketing/campaigns", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);

    const limitRaw = Number(req.query.limit ?? 100);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 100));
    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;

    const whereClause = statusParam
      ? and(
          eq(marketingCampaigns.companyId, companyId),
          eq(marketingCampaigns.status, statusParam as MarketingCampaignStatus),
        )
      : eq(marketingCampaigns.companyId, companyId);

    const rows = await db
      .select()
      .from(marketingCampaigns)
      .where(whereClause)
      .orderBy(desc(marketingCampaigns.createdAt))
      .limit(limit);

    res.json({ campaigns: rows });
  });

  router.post("/marketing/campaigns", validate(createCampaignSchema), async (req, res) => {
    const body = req.body as z.infer<typeof createCampaignSchema>;
    assertCompanyAccess(req, body.companyId);

    const initialAssets: MarketingCampaignAssets = {};
    const [inserted] = await db
      .insert(marketingCampaigns)
      .values({
        companyId: body.companyId,
        name: body.name,
        topic: body.topic,
        platforms: body.platforms,
        status: "draft",
        assets: initialAssets,
      })
      .returning();

    res.status(201).json({ campaign: inserted, tone: body.tone ?? null });
  });

  router.get("/marketing/campaigns/:id", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);
    const rawId = req.params.id;
    const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
    if (!id) throw badRequest("campaign id is required");

    const [row] = await db
      .select()
      .from(marketingCampaigns)
      .where(and(eq(marketingCampaigns.id, id), eq(marketingCampaigns.companyId, companyId)))
      .limit(1);

    if (!row) throw notFound("campaign not found");
    res.json({ campaign: row });
  });

  router.post(
    "/marketing/campaigns/:id/publish",
    validate(publishCampaignSchema),
    async (req, res) => {
      const companyId = resolveCompanyId(req);
      if (!companyId) throw badRequest("companyId could not be resolved from the request");
      assertCompanyAccess(req, companyId);
      const rawId = req.params.id;
      const id = typeof rawId === "string" ? rawId : Array.isArray(rawId) ? rawId[0] : undefined;
      if (!id) throw badRequest("campaign id is required");

      const [row] = await db
        .select()
        .from(marketingCampaigns)
        .where(and(eq(marketingCampaigns.id, id), eq(marketingCampaigns.companyId, companyId)))
        .limit(1);

      if (!row) throw notFound("campaign not found");
      if (row.status !== "ready" && row.status !== "scheduled" && row.status !== "draft") {
        throw badRequest(
          `campaign ${id} cannot be published in status ${row.status}`,
        );
      }

      const body = req.body as z.infer<typeof publishCampaignSchema>;
      const scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
      const targetStatus: MarketingCampaignStatus = scheduledAt ? "scheduled" : "publishing";

      const [updated] = await db
        .update(marketingCampaigns)
        .set({
          status: targetStatus,
          scheduledAt,
          updatedAt: new Date(),
        })
        .where(and(eq(marketingCampaigns.id, id), eq(marketingCampaigns.companyId, companyId)))
        .returning();

      res.json({ campaign: updated });
    },
  );

  return router;
}
