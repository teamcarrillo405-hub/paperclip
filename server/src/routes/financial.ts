import { Router, type Response } from "express";
import type { Db } from "@paperclipai/db";
import { QuickBooksNotConnectedError } from "@paperclipai/plugin-quickbooks";
import {
  financialSummaryService,
  type FinancialSummary,
} from "../services/financial-summary.js";
import { badRequest } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function handleQbError(err: unknown, res: Response): boolean {
  if (err instanceof QuickBooksNotConnectedError) {
    res.status(409).json({
      error: "quickbooks_not_connected",
      message: err.message,
      connectUrl: "/company/settings/integrations",
    });
    return true;
  }
  return false;
}

export function financialRoutes(db: Db) {
  const router = Router();
  const svc = financialSummaryService(db);

  /**
   * GET /api/financial/summary?companyId=&period=current|last|YYYY-MM
   *
   * Full bookkeeper summary: health score, headline insight, bullet insights,
   * alerts, recommendations, and the raw P&L / A/R figures.
   */
  router.get("/financial/summary", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const period = typeof req.query.period === "string" ? req.query.period : "current";

    try {
      const summary = await svc.generate(companyId, period);
      res.json(summary);
    } catch (err) {
      if (handleQbError(err, res)) return;
      throw err;
    }
  });

  /**
   * GET /api/financial/health-score?companyId=&period=
   *
   * Lightweight endpoint that returns only the health score and label —
   * suitable for a sidebar badge or a dashboard tile.
   */
  router.get("/financial/health-score", async (req, res) => {
    const companyId = requireString(req.query.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const period = typeof req.query.period === "string" ? req.query.period : "current";

    try {
      const summary: FinancialSummary = await svc.generate(companyId, period);
      res.json({
        healthScore: summary.healthScore,
        healthLabel: summary.healthLabel,
        period: summary.period,
      });
    } catch (err) {
      if (handleQbError(err, res)) return;
      throw err;
    }
  });

  /**
   * POST /api/financial/refresh
   *
   * Invalidate the cached summary for the given company (and optional period),
   * then return a freshly generated summary.
   */
  router.post("/financial/refresh", async (req, res) => {
    const body = (req.body ?? {}) as { companyId?: unknown; period?: unknown };
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);
    const period = typeof body.period === "string" ? body.period : "current";

    svc.invalidate(companyId, period);
    try {
      const summary = await svc.generate(companyId, period);
      res.json(summary);
    } catch (err) {
      if (handleQbError(err, res)) return;
      throw err;
    }
  });

  return router;
}
