import { Router, type Request } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { badRequest, forbidden, notFound } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import { resellerService } from "../services/reseller.js";
import { assertBoard } from "./authz.js";

const applyBodySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  company: z.string().min(1).optional(),
  clientCount: z.number().int().nonnegative().optional(),
});

const attachClientBodySchema = z.object({
  companyId: z.string().uuid(),
});

function actorEmail(req: Request): string | undefined {
  if (req.actor.type === "board") {
    return req.actor.userEmail ?? undefined;
  }
  return undefined;
}

function requireBoardActor(req: Request) {
  assertBoard(req);
  if (req.actor.type !== "board") {
    throw forbidden("Board access required");
  }
}

export function resellerRoutes(db: Db) {
  const router = Router();
  const svc = resellerService(db);

  async function currentPartner(req: Request) {
    requireBoardActor(req);
    const email = actorEmail(req);
    if (!email) {
      throw forbidden("No user email on session");
    }
    const partner = await svc.getPartnerByEmail(email);
    if (!partner) {
      throw notFound("No partner account for this user");
    }
    return partner;
  }

  router.post("/reseller/apply", validate(applyBodySchema), async (req, res) => {
    requireBoardActor(req);
    const body = req.body as z.infer<typeof applyBodySchema>;
    const email = actorEmail(req) ?? body.email;
    if (email !== body.email) {
      // Enforce the applicant email matches the signed-in user so a user can
      // only create a partner record for themselves.
      throw badRequest("Applicant email must match the signed-in user");
    }
    const result = await svc.createResellerAccount(body.name, body.email, body.company);
    res.json(result);
  });

  router.get("/reseller/me", async (req, res) => {
    requireBoardActor(req);
    const email = actorEmail(req);
    if (!email) {
      res.json({ partner: null });
      return;
    }
    const partner = await svc.getPartnerByEmail(email);
    if (!partner) {
      res.json({ partner: null });
      return;
    }
    res.json({
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        company: partner.company,
        partnerCode: partner.partnerCode,
        stripeConnectStatus: partner.stripeConnectStatus,
        commissionPercent: partner.commissionPercent,
      },
    });
  });

  router.get("/reseller/onboarding-link", async (req, res) => {
    const partner = await currentPartner(req);
    const result = await svc.getResellerOnboardingLink(partner.id);
    res.json(result);
  });

  router.get("/reseller/dashboard-link", async (req, res) => {
    const partner = await currentPartner(req);
    const result = await svc.getResellerDashboardLink(partner.id);
    res.json(result);
  });

  router.get("/reseller/metrics", async (req, res) => {
    const partner = await currentPartner(req);
    const metrics = await svc.getResellerMetrics(partner.id);
    res.json(metrics);
  });

  router.get("/reseller/clients", async (req, res) => {
    const partner = await currentPartner(req);
    const clients = await svc.listClientsForReseller(partner.id);
    res.json({ clients });
  });

  router.post("/reseller/clients", validate(attachClientBodySchema), async (req, res) => {
    const partner = await currentPartner(req);
    const body = req.body as z.infer<typeof attachClientBodySchema>;
    await svc.attachClientToReseller(body.companyId, partner.id);
    res.json({ ok: true });
  });

  router.get("/reseller/referral-link", async (req, res) => {
    const partner = await currentPartner(req);
    const result = await svc.getReferralLink(partner.id);
    res.json(result);
  });

  return router;
}

export function resellerWebhookRoutes(db: Db) {
  const router = Router();
  const svc = resellerService(db);

  router.post("/reseller/webhook", async (req, res) => {
    const signature = req.header("stripe-signature");
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    const rawBody =
      (req as unknown as { rawBody?: Buffer }).rawBody ??
      (typeof req.body === "string"
        ? Buffer.from(req.body)
        : Buffer.from(JSON.stringify(req.body ?? {})));
    try {
      const result = await svc.handleConnectWebhookEvent(rawBody, signature);
      res.json(result);
    } catch (err) {
      logger.error({ err }, "reseller webhook processing failed");
      res.status(400).json({ error: (err as Error).message });
    }
  });

  return router;
}
