// Register in server/src/app.ts:
// import { pushSubscriptionRoutes } from "./routes/push-subscriptions.js";
// api.use(pushSubscriptionRoutes(db));

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { assertCompanyAccess, assertInstanceAdmin } from "./authz.js";
import {
  addSubscription,
  removeSubscription,
  sendPushToCompany,
} from "../services/push-subscriptions.js";

// Minimal inline type guard — avoids importing zod just for this route
function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isPushSubscriptionBody(v: unknown): v is {
  endpoint: string;
  expirationTime: number | null;
  keys: { p256dh: string; auth: string };
} {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const obj = v as Record<string, unknown>;
  return (
    isNonEmptyString(obj["endpoint"]) &&
    (obj["expirationTime"] === null || typeof obj["expirationTime"] === "number") &&
    obj["keys"] !== null &&
    typeof obj["keys"] === "object" &&
    !Array.isArray(obj["keys"]) &&
    isNonEmptyString((obj["keys"] as Record<string, unknown>)["p256dh"]) &&
    isNonEmptyString((obj["keys"] as Record<string, unknown>)["auth"])
  );
}

export function pushSubscriptionRoutes(_db: Db): Router {
  const router = Router();

  // POST /api/push/subscribe — store a push subscription for the given company
  router.post("/push/subscribe", async (req, res, next) => {
    try {
      const { companyId, subscription } = req.body as {
        companyId?: unknown;
        subscription?: unknown;
      };

      if (!isNonEmptyString(companyId)) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      if (!isPushSubscriptionBody(subscription)) {
        res.status(400).json({ error: "subscription must be a valid PushSubscription object" });
        return;
      }

      assertCompanyAccess(req, companyId);

      await addSubscription(companyId, subscription);

      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // DELETE /api/push/subscribe — remove a push subscription by endpoint
  router.delete("/push/subscribe", async (req, res, next) => {
    try {
      const { companyId, endpoint } = req.body as {
        companyId?: unknown;
        endpoint?: unknown;
      };

      if (!isNonEmptyString(companyId)) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      if (!isNonEmptyString(endpoint)) {
        res.status(400).json({ error: "endpoint is required" });
        return;
      }

      assertCompanyAccess(req, companyId);

      await removeSubscription(companyId, endpoint);

      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/push/send — instance admin: broadcast a push to all subscribers of a company
  router.post("/push/send", async (req, res, next) => {
    try {
      assertInstanceAdmin(req);

      const { companyId, title, body } = req.body as {
        companyId?: unknown;
        title?: unknown;
        body?: unknown;
      };

      if (!isNonEmptyString(companyId)) {
        res.status(400).json({ error: "companyId is required" });
        return;
      }

      if (!isNonEmptyString(body)) {
        res.status(400).json({ error: "body is required" });
        return;
      }

      const result = await sendPushToCompany(companyId, {
        title: isNonEmptyString(title) ? title : undefined,
        body,
      });

      res.status(200).json({ ok: true, ...result });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
