import type { RequestHandler } from "express";
import { validatePortalSession } from "../services/portal-store.js";
import type { PortalUser } from "../services/portal-store.js";

declare global {
  namespace Express {
    interface Request {
      portalUser?: PortalUser;
      portalCompanyId?: string;
    }
  }
}

export function portalAuthMiddleware(): RequestHandler {
  return async (req, res, next) => {
    const authHeader = req.header("authorization");
    if (!authHeader?.toLowerCase().startsWith("bearer ")) {
      res.status(401).json({ error: "Portal authentication required" });
      return;
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: "Portal authentication required" });
      return;
    }

    const result = await validatePortalSession(token);
    if (!result) {
      res.status(401).json({ error: "Invalid or expired portal session" });
      return;
    }

    req.portalUser = result.user;
    req.portalCompanyId = result.companyId;
    next();
  };
}
