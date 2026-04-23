import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { roiMetricsService, type RoiPeriod } from "../services/roi-metrics.js";
import { assertCompanyAccess } from "./authz.js";
import { badRequest } from "../errors.js";

function parsePeriod(raw: unknown): RoiPeriod {
  if (raw === "7d" || raw === "30d" || raw === "90d") return raw;
  if (raw == null || raw === "") return "30d";
  throw badRequest("Invalid period. Must be one of: 7d, 30d, 90d");
}

export function roiRoutes(db: Db) {
  const router = Router();
  const svc = roiMetricsService(db);

  router.get("/companies/:companyId/roi/metrics", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const period = parsePeriod(req.query.period);
    const metrics = await svc.getRoiMetrics(companyId, period);
    res.json(metrics);
  });

  router.get("/companies/:companyId/roi/timeline", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const period = parsePeriod(req.query.period);
    const timeline = await svc.getRoiTimeline(companyId, period);
    res.json(timeline);
  });

  return router;
}
