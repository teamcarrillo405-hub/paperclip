// Register in server/src/app.ts:
// import { healthDetailedRoutes } from "./routes/health-detailed.js";
// api.use(healthDetailedRoutes(db));

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { runHealthCheck } from "../services/health-monitor.js";

export function healthDetailedRoutes(db: Db) {
  const router = Router();

  router.get("/health/detailed", async (_req, res) => {
    const health = await runHealthCheck(db);
    const httpStatus = health.status === "unhealthy" ? 503 : 200;
    res.status(httpStatus).json(health);
  });

  return router;
}
