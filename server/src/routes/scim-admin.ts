// Register in server/src/app.ts:
// import { scimAdminRoutes } from "./routes/scim-admin.js";
// api.use(scimAdminRoutes());

import { Router } from "express";
import { getSCIMToken, generateSCIMToken, deleteSCIMToken } from "../services/scim-token.js";
import { assertInstanceAdmin } from "./authz.js";

export function scimAdminRoutes() {
  const router = Router();

  /**
   * GET /instance/scim/token
   * Return token status (exists, createdAt, description) — never the actual token.
   */
  router.get("/instance/scim/token", async (req, res) => {
    assertInstanceAdmin(req);
    const stored = await getSCIMToken();
    if (!stored) {
      res.json({ exists: false });
      return;
    }
    res.json({
      exists: true,
      createdAt: stored.createdAt,
      description: stored.description ?? null,
    });
  });

  /**
   * POST /instance/scim/token
   * Generate a new SCIM bearer token. Returns the raw token ONE TIME only.
   */
  router.post("/instance/scim/token", async (req, res) => {
    assertInstanceAdmin(req);
    const description = typeof req.body?.description === "string" ? req.body.description : undefined;
    const generated = await generateSCIMToken(description);
    res.status(201).json({
      token: generated.token,
      createdAt: generated.createdAt,
      description: generated.description ?? null,
    });
  });

  /**
   * DELETE /instance/scim/token
   * Revoke the current SCIM bearer token.
   */
  router.delete("/instance/scim/token", async (req, res) => {
    assertInstanceAdmin(req);
    await deleteSCIMToken();
    res.status(204).end();
  });

  return router;
}
