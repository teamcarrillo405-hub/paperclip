// Postiz runs as a Docker sidecar. See https://github.com/gitroomhq/postiz-app
// for docker-compose setup.
//
// This router owns the Paperclip-side records in `social_posts` and uses the
// `@paperclipai/plugin-social` `SocialService` to talk to Postiz for
// scheduling, cancellation, analytics, and comment-queue reads.

import { Router, type Request } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { socialPosts, type Db } from "@paperclipai/db";
import {
  SocialService,
  type SocialPlatform,
} from "@paperclipai/plugin-social";
import { validate } from "../middleware/validate.js";
import { badRequest } from "../errors.js";
import { logger } from "../middleware/logger.js";
import { assertCompanyAccess } from "./authz.js";

const PLATFORM_VALUES = [
  "instagram",
  "linkedin",
  "x",
  "reddit",
  "google_business",
] as const;
const platformSchema = z.enum(PLATFORM_VALUES);

const createPostSchema = z.object({
  companyId: z.string().min(1),
  platforms: z.array(platformSchema).min(1),
  content: z.string().min(1),
  scheduledAt: z.string().optional(),
  mediaUrl: z.string().optional(),
  publishNow: z.boolean().optional(),
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

function socialServiceOrNull(): SocialService | null {
  const baseUrl = process.env.POSTIZ_INTERNAL_URL;
  const apiKey = process.env.POSTIZ_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return new SocialService({
    postizBaseUrl: baseUrl,
    postizApiKey: apiKey,
    openaiApiKey: process.env.OPENAI_API_KEY,
  });
}

export function socialRoutes(db: Db) {
  const router = Router();

  router.get("/social/posts", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);

    const limitRaw = Number(req.query.limit ?? 50);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 50));
    const statusParam = typeof req.query.status === "string" ? req.query.status : undefined;
    const statusFilter =
      statusParam === "scheduled" ||
      statusParam === "published" ||
      statusParam === "failed" ||
      statusParam === "cancelled"
        ? statusParam
        : undefined;

    const whereClause = statusFilter
      ? and(eq(socialPosts.companyId, companyId), eq(socialPosts.status, statusFilter))
      : eq(socialPosts.companyId, companyId);

    const rows = await db
      .select()
      .from(socialPosts)
      .where(whereClause)
      .orderBy(desc(socialPosts.createdAt))
      .limit(limit);

    res.json({ posts: rows });
  });

  router.post("/social/posts", validate(createPostSchema), async (req, res) => {
    const body = req.body as z.infer<typeof createPostSchema>;
    assertCompanyAccess(req, body.companyId);

    const service = socialServiceOrNull();
    if (!service) {
      throw badRequest(
        "Social posting is not configured: POSTIZ_INTERNAL_URL and/or POSTIZ_API_KEY are missing.",
      );
    }

    const platforms = body.platforms as SocialPlatform[];
    let postizPostId: string | null = null;
    let status: "scheduled" | "published" | "failed" = "scheduled";
    let publishedAt: Date | null = null;
    let scheduledAt: Date | null = null;

    try {
      if (body.publishNow) {
        const result = await service.publishNow({
          platforms,
          content: body.content,
          mediaUrl: body.mediaUrl,
        });
        postizPostId = result.postizPostId ?? result.id;
        status = "published";
        publishedAt = new Date();
      } else {
        if (!body.scheduledAt) {
          throw badRequest("`scheduledAt` is required unless `publishNow` is true");
        }
        const result = await service.schedulePost({
          platforms,
          content: body.content,
          scheduledAt: body.scheduledAt,
          mediaUrl: body.mediaUrl,
        });
        postizPostId = result.postizPostId ?? result.id;
        status = "scheduled";
        scheduledAt = new Date(body.scheduledAt);
      }
    } catch (err) {
      logger.error({ err, companyId: body.companyId }, "social post create failed");
      status = "failed";
    }

    const [inserted] = await db
      .insert(socialPosts)
      .values({
        companyId: body.companyId,
        postizPostId,
        platforms,
        content: body.content,
        status,
        scheduledAt,
        publishedAt,
      })
      .returning();

    res.status(status === "failed" ? 502 : 201).json({ post: inserted });
  });

  router.delete("/social/posts/:id", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);

    const postId = req.params.id;
    if (!postId) throw badRequest("post id is required");

    const [existing] = await db
      .select()
      .from(socialPosts)
      .where(and(eq(socialPosts.id, postId), eq(socialPosts.companyId, companyId)))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: "post not found" });
      return;
    }

    const service = socialServiceOrNull();
    if (service && existing.postizPostId) {
      try {
        await service.cancelPost(existing.postizPostId);
      } catch (err) {
        logger.error({ err, postId }, "social cancel failed (continuing to mark cancelled)");
      }
    }

    const [updated] = await db
      .update(socialPosts)
      .set({ status: "cancelled", updatedAt: new Date() })
      .where(eq(socialPosts.id, postId))
      .returning();

    res.json({ post: updated });
  });

  router.get("/social/stats", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);

    const rows = await db
      .select({
        status: socialPosts.status,
        platforms: socialPosts.platforms,
        createdAt: socialPosts.createdAt,
      })
      .from(socialPosts)
      .where(eq(socialPosts.companyId, companyId));

    const now = Date.now();
    const MONTH = 30 * 24 * 60 * 60 * 1000;
    let scheduled = 0;
    let published = 0;
    let failed = 0;
    let cancelled = 0;
    let postsThisMonth = 0;
    const platformBreakdown: Record<string, number> = {};

    for (const row of rows) {
      if (row.status === "scheduled") scheduled += 1;
      else if (row.status === "published") published += 1;
      else if (row.status === "failed") failed += 1;
      else if (row.status === "cancelled") cancelled += 1;
      if (now - new Date(row.createdAt).getTime() <= MONTH) postsThisMonth += 1;
      const plats = Array.isArray(row.platforms) ? row.platforms : [];
      for (const p of plats) {
        platformBreakdown[p] = (platformBreakdown[p] ?? 0) + 1;
      }
    }

    res.json({
      total: rows.length,
      scheduled,
      published,
      failed,
      cancelled,
      postsThisMonth,
      platformsConnected: Object.keys(platformBreakdown).length,
      platformBreakdown,
    });
  });

  router.get("/social/comments", async (req, res) => {
    const companyId = resolveCompanyId(req);
    if (!companyId) throw badRequest("companyId could not be resolved from the request");
    assertCompanyAccess(req, companyId);

    const service = socialServiceOrNull();
    if (!service) {
      res.json({ comments: [], configured: false });
      return;
    }

    const platformFilter = typeof req.query.platform === "string" ? req.query.platform : undefined;
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Math.max(1, Math.min(100, Number.isFinite(limitRaw) ? limitRaw : 20));

    const platforms = platformFilter
      ? [platformFilter as SocialPlatform]
      : ([...PLATFORM_VALUES] as SocialPlatform[]);

    const perPlatform = Math.max(1, Math.ceil(limit / platforms.length));
    const all = await Promise.all(
      platforms.map(async (p) => {
        try {
          return await service.getRecentComments(p, perPlatform);
        } catch (err) {
          logger.error({ err, platform: p }, "social comments fetch failed");
          return [];
        }
      }),
    );

    const comments = all.flat().slice(0, limit);
    res.json({ comments, configured: true });
  });

  return router;
}
