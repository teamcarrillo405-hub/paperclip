// Register in server/src/app.ts:
// import { searchGroundingRoutes } from "./routes/search-grounding.js";
// api.use(searchGroundingRoutes());

import { Router } from "express";
import { badRequest } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  searchWeb,
  detectProvider,
  isSearchConfigured,
} from "../services/search-grounding.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export function searchGroundingRoutes() {
  const router = Router();

  // GET /search/status — check which provider is configured
  router.get("/search/status", (_req, res) => {
    const provider = detectProvider();
    res.json({ configured: isSearchConfigured(), provider });
  });

  // POST /search — run a web search
  router.post("/search", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = requireString(body.query, "query");
    const companyId = optionalString(body.companyId);
    if (companyId) {
      assertCompanyAccess(req, companyId);
    }
    const result = await searchWeb(query);
    res.json(result);
  });

  // POST /search/grounded-generate — search + generate with grounding context
  router.post("/search/grounded-generate", async (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const query = requireString(body.query, "query");
    const topic = requireString(body.topic, "topic");
    const docType = requireString(body.docType, "docType");
    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const searchResults = await searchWeb(query);
    const groundedTopic = searchResults.groundingContext
      ? `${topic}${searchResults.groundingContext}`
      : topic;

    const port = process.env.PORT ?? "3100";
    const generateResponse = await fetch(`http://localhost:${port}/api/writing/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyId,
        docType,
        topic: groundedTopic,
      }),
    });

    if (!generateResponse.ok) {
      const errText = await generateResponse.text().catch(() => generateResponse.statusText);
      throw badRequest(`Writing generation failed: ${errText}`);
    }

    const generatedContent = await generateResponse.json();
    res.json({ searchResults, generatedContent });
  });

  return router;
}
