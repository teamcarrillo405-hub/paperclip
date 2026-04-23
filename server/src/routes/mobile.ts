import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { approvals, mobileDevices } from "@paperclipai/db";
import { and, desc, eq, inArray } from "drizzle-orm";
import { approvalService } from "../services/index.js";
import { logger } from "../middleware/logger.js";
import { assertAuthenticated, getActorInfo } from "./authz.js";
import { badRequest, forbidden } from "../errors.js";

function resolveCompanyIdsForActor(req: Parameters<typeof assertAuthenticated>[0]): string[] {
  if (req.actor.type === "agent" && req.actor.companyId) {
    return [req.actor.companyId];
  }
  if (req.actor.type === "board") {
    if (Array.isArray(req.actor.companyIds) && req.actor.companyIds.length > 0) {
      return req.actor.companyIds;
    }
  }
  return [];
}

function isValidPlatform(value: unknown): value is "ios" | "android" {
  return value === "ios" || value === "android";
}

export function mobileRoutes(db: Db) {
  const router = Router();
  const approvalsSvc = approvalService(db);

  router.post("/mobile/register-device", async (req, res) => {
    assertAuthenticated(req);
    const { deviceToken, platform, userId } = req.body ?? {};
    if (typeof deviceToken !== "string" || deviceToken.length === 0) {
      throw badRequest("deviceToken is required");
    }
    if (!isValidPlatform(platform)) {
      throw badRequest("platform must be 'ios' or 'android'");
    }
    const actorUserId = typeof userId === "string" && userId.length > 0 ? userId : req.actor.userId;
    if (!actorUserId) {
      throw badRequest("userId is required");
    }

    const companyIds = resolveCompanyIdsForActor(req);
    if (companyIds.length === 0) {
      throw forbidden("Actor has no company membership to associate device with");
    }
    const companyId = companyIds[0] as string;
    const now = new Date();

    const existing = await db
      .select()
      .from(mobileDevices)
      .where(eq(mobileDevices.deviceToken, deviceToken))
      .then((rows) => rows[0] ?? null);

    if (existing) {
      const [updated] = await db
        .update(mobileDevices)
        .set({
          userId: actorUserId,
          companyId,
          platform,
          updatedAt: now,
        })
        .where(eq(mobileDevices.id, existing.id))
        .returning();
      res.json(updated);
      return;
    }

    const [inserted] = await db
      .insert(mobileDevices)
      .values({
        userId: actorUserId,
        companyId,
        deviceToken,
        platform,
      })
      .returning();
    logger.info({ companyId, userId: actorUserId, platform }, "mobile: registered device");
    res.status(201).json(inserted);
  });

  router.delete("/mobile/unregister-device", async (req, res) => {
    assertAuthenticated(req);
    const { deviceToken } = req.body ?? {};
    if (typeof deviceToken !== "string" || deviceToken.length === 0) {
      throw badRequest("deviceToken is required");
    }
    await db.delete(mobileDevices).where(eq(mobileDevices.deviceToken, deviceToken));
    res.status(204).end();
  });

  router.get("/mobile/approvals", async (req, res) => {
    assertAuthenticated(req);
    const companyIds = resolveCompanyIdsForActor(req);
    if (companyIds.length === 0) {
      res.json({ approvals: [] });
      return;
    }
    const rows = await db
      .select()
      .from(approvals)
      .where(and(inArray(approvals.companyId, companyIds), eq(approvals.status, "pending")))
      .orderBy(desc(approvals.createdAt));
    res.json({ approvals: rows });
  });

  router.post("/mobile/approvals/:id/respond", async (req, res) => {
    assertAuthenticated(req);
    const id = req.params.id as string;
    const { approved, reason } = req.body ?? {};
    if (typeof approved !== "boolean") {
      throw badRequest("approved must be a boolean");
    }

    const existing = await approvalsSvc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    const companyIds = resolveCompanyIdsForActor(req);
    if (!companyIds.includes(existing.companyId)) {
      throw forbidden("Approval does not belong to an accessible company");
    }

    const actor = getActorInfo(req);
    const decisionNote = typeof reason === "string" ? reason : null;

    const result = approved
      ? await approvalsSvc.approve(id, actor.actorId, decisionNote)
      : await approvalsSvc.reject(id, actor.actorId, decisionNote);

    res.json(result.approval);
  });

  return router;
}
