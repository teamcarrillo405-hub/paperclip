import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest, forbidden } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import { billingService } from "../services/billing.js";
import { BILLING_PLAN_IDS, isBillingPlanId } from "../services/billing-plans.js";
import { readReferralCookie } from "../middleware/referral-cookie.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const checkoutBodySchema = z.object({
  planId: z.enum(["starter", "growth", "scale"]),
  successUrl: z.string().url(),
  cancelUrl: z.string().url(),
});

const portalBodySchema = z.object({
  returnUrl: z.string().url(),
});

function requireBoardActor(req: Request) {
  assertBoard(req);
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
}

function actorEmail(req: Request): string | undefined {
  if (req.actor.type === "board") {
    return req.actor.userEmail ?? undefined;
  }
  return undefined;
}

export function billingRoutes(db: Db) {
  const router = Router();
  const svc = billingService(db);

  router.post("/billing/:companyId/checkout", validate(checkoutBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    requireBoardActor(req);
    assertCompanyAccess(req, companyId);
    const { planId, successUrl, cancelUrl } = req.body as z.infer<typeof checkoutBodySchema>;
    if (!isBillingPlanId(planId)) {
      throw badRequest(`Unknown plan: ${planId}. Expected one of ${BILLING_PLAN_IDS.join(", ")}.`);
    }
    const result = await svc.createCheckoutSession(
      companyId,
      planId,
      successUrl,
      cancelUrl,
      actorEmail(req),
      readReferralCookie(req),
    );
    res.json(result);
  });

  router.post("/billing/:companyId/portal", validate(portalBodySchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    requireBoardActor(req);
    assertCompanyAccess(req, companyId);
    const { returnUrl } = req.body as z.infer<typeof portalBodySchema>;
    const result = await svc.createBillingPortalSession(companyId, returnUrl);
    res.json(result);
  });

  router.get("/billing/:companyId/status", async (req, res) => {
    const companyId = req.params.companyId as string;
    requireBoardActor(req);
    assertCompanyAccess(req, companyId);
    const status = await svc.getSubscriptionStatus(companyId);
    res.json(status);
  });

  return router;
}

export function billingWebhookRoutes(db: Db) {
  const router = Router();
  const svc = billingService(db);

  router.post("/billing/webhook", async (req, res) => {
    const signature = req.header("stripe-signature");
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    const rawBody =
      (req as unknown as { rawBody?: Buffer }).rawBody ??
      (typeof req.body === "string" ? Buffer.from(req.body) : Buffer.from(JSON.stringify(req.body ?? {})));
    try {
      const result = await svc.handleWebhookEvent(rawBody, signature);
      res.json(result);
    } catch (err) {
      logger.error({ err }, "billing webhook processing failed");
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
