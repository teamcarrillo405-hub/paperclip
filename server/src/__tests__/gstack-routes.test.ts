import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Fixtures -------------------------------------------------------
const COMPANY_ID = "company-1";
const RUN_ID = "run-1";
const AGENT_ID = "agent-1";

const mockRun = {
  id: RUN_ID,
  companyId: COMPANY_ID,
  agentId: AGENT_ID,
  status: "running",
  resultJson: null,
  startedAt: new Date("2026-01-01T00:00:00Z"),
  finishedAt: null,
};

const mockMeta = {
  id: "meta-1",
  heartbeatRunId: RUN_ID,
  skill: "office-hours",
  budgetUsd: "5.00",
  artifactJson: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const mockCostEvent = {
  id: "event-1",
  companyId: COMPANY_ID,
  agentId: AGENT_ID,
  heartbeatRunId: RUN_ID,
  provider: "claude-code",
  model: "gstack",
  biller: "gstack",
  billingType: "gstack",
  inputTokens: 1000,
  outputTokens: 0,
  costCents: 0,
  occurredAt: new Date(),
  createdAt: new Date(),
};

// ---- Mock DB helpers ------------------------------------------------

function makeMockQuery(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of [
    "from", "where", "innerJoin", "orderBy", "limit",
    "set", "values", "onConflictDoNothing", "returning",
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown,
  ) => Promise.resolve(returnValue).then(resolve, reject);
  return chain;
}

function makeDb(overrides: Record<string, unknown> = {}) {
  return {
    select: vi.fn(() => makeMockQuery([mockRun])),
    insert: vi.fn(() => makeMockQuery([mockMeta])),
    update: vi.fn(() => makeMockQuery([mockRun])),
    ...overrides,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ---- App factory ----------------------------------------------------

async function createApp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  actorOverrides: Record<string, unknown> = {},
) {
  const [{ errorHandler }, { gstackRoutes }] = await Promise.all([
    import("../middleware/index.js"),
    import("../routes/gstack.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any).actor = {
      type: "board",
      userId: "user-1",
      companyIds: [COMPANY_ID],
      source: "local_implicit",
      isInstanceAdmin: false,
      ...actorOverrides,
    };
    next();
  });
  app.use(gstackRoutes(db));
  app.use(errorHandler);
  return app;
}

// ---- Tests ----------------------------------------------------------

describe("gstack routes", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  // ------------------------------------------------------------------
  describe("POST /gstack/runs/:id/start", () => {
    it("returns 201 with new metadata row", async () => {
      const db = makeDb();
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/start`)
        .send({ skill: "office-hours", budget_usd: 5 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ heartbeatRunId: RUN_ID });
    });

    it("returns 404 when run does not exist", async () => {
      const db = makeDb({ select: vi.fn(() => makeMockQuery([])) });
      const app = await createApp(db);
      const res = await request(app)
        .post("/gstack/runs/nonexistent/start")
        .send({});
      expect(res.status).toBe(404);
    });

    it("returns 403 when run belongs to another company", async () => {
      const db = makeDb({
        select: vi.fn(() => makeMockQuery([{ ...mockRun, companyId: "other" }])),
      });
      // local_implicit bypasses company checks — use session source to enforce them
      const app = await createApp(db, { source: "session" });
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/start`)
        .send({});
      expect(res.status).toBe(403);
    });

    it("returns 200 with existing row on insert conflict", async () => {
      let selectCount = 0;
      const db = makeDb({
        select: vi.fn(() => {
          selectCount++;
          // First call: getRunOrThrow; second call: fetch existing metadata after conflict
          return makeMockQuery(selectCount === 1 ? [mockRun] : [mockMeta]);
        }),
        insert: vi.fn(() => makeMockQuery([])), // onConflictDoNothing → no row returned
      });
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/start`)
        .send({ skill: "office-hours" });
      expect(res.status).toBe(200);
    });
  });

  // ------------------------------------------------------------------
  describe("POST /gstack/runs/:id/spend", () => {
    it("returns 201 with the new cost event", async () => {
      const db = makeDb({
        insert: vi.fn(() => makeMockQuery([mockCostEvent])),
      });
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/spend`)
        .send({ input_tokens: 1000, output_tokens: 0 });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({ provider: "claude-code", model: "gstack" });
    });

    it("returns 403 when run belongs to another company", async () => {
      const db = makeDb({
        select: vi.fn(() => makeMockQuery([{ ...mockRun, companyId: "other" }])),
      });
      const app = await createApp(db, { source: "session" });
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/spend`)
        .send({ input_tokens: 100 });
      expect(res.status).toBe(403);
    });

    it("coerces non-numeric token counts to 0", async () => {
      const db = makeDb({
        insert: vi.fn(() => makeMockQuery([{ ...mockCostEvent, inputTokens: 0, costCents: 0 }])),
      });
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/spend`)
        .send({ input_tokens: "bad", output_tokens: null });
      expect(res.status).toBe(201);
    });
  });

  // ------------------------------------------------------------------
  describe("POST /gstack/runs/:id/artifacts", () => {
    it("returns 200 with updated metadata", async () => {
      const updated = { ...mockMeta, artifactJson: { path: "output.md" } };
      const db = makeDb({ update: vi.fn(() => makeMockQuery([updated])) });
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/artifacts`)
        .send({ artifact_json: { path: "output.md" } });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ artifactJson: { path: "output.md" } });
    });

    it("returns 400 when artifact_json is not an object", async () => {
      const db = makeDb();
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/artifacts`)
        .send({ artifact_json: "not-an-object" });
      expect(res.status).toBe(400);
    });

    it("returns 400 when artifact_json is an array", async () => {
      const db = makeDb();
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/artifacts`)
        .send({ artifact_json: [1, 2, 3] });
      expect(res.status).toBe(400);
    });

    it("returns 404 when no gstack metadata exists for the run", async () => {
      const db = makeDb({ update: vi.fn(() => makeMockQuery([])) });
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/artifacts`)
        .send({ artifact_json: { x: 1 } });
      expect(res.status).toBe(404);
    });
  });

  // ------------------------------------------------------------------
  describe("POST /gstack/runs/:id/complete", () => {
    it("returns run immediately without DB write when already succeeded", async () => {
      const succeededRun = { ...mockRun, status: "succeeded" };
      const db = makeDb({ select: vi.fn(() => makeMockQuery([succeededRun])) });
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/complete`)
        .send({ result: { summary: "done" } });
      expect(res.status).toBe(200);
      expect(db.update).not.toHaveBeenCalled();
    });

    it("merges result json and returns 200 for a running run", async () => {
      const updatedRun = {
        ...mockRun,
        resultJson: { summary: "done", skill_output: { artifact_paths: [] } },
      };
      const db = makeDb({ update: vi.fn(() => makeMockQuery([updatedRun])) });
      const app = await createApp(db);
      const res = await request(app)
        .post(`/gstack/runs/${RUN_ID}/complete`)
        .send({ result: { summary: "done" }, skill_output: { artifact_paths: [] } });
      expect(res.status).toBe(200);
      expect(res.body.resultJson).toMatchObject({ summary: "done" });
    });
  });

  // ------------------------------------------------------------------
  describe("GET /gstack/runs/:id/budget-status", () => {
    it("returns allowed:true when spend is under budget", async () => {
      let selectCount = 0;
      const db = makeDb({
        select: vi.fn(() => {
          selectCount++;
          if (selectCount === 1) return makeMockQuery([mockRun]);
          if (selectCount === 2) return makeMockQuery([mockMeta]); // budgetUsd: "5.00"
          return makeMockQuery([{ total: "10" }]); // 10 cents = $0.10
        }),
      });
      const app = await createApp(db);
      const res = await request(app).get(`/gstack/runs/${RUN_ID}/budget-status`);
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
      expect(res.body.budget_usd).toBe(5);
      expect(res.body.spend_usd).toBe(0.1);
    });

    it("returns allowed:false when spend exceeds budget", async () => {
      let selectCount = 0;
      const db = makeDb({
        select: vi.fn(() => {
          selectCount++;
          if (selectCount === 1) return makeMockQuery([mockRun]);
          if (selectCount === 2) return makeMockQuery([{ ...mockMeta, budgetUsd: "0.01" }]);
          return makeMockQuery([{ total: "200" }]); // $2.00 > $0.01
        }),
      });
      const app = await createApp(db);
      const res = await request(app).get(`/gstack/runs/${RUN_ID}/budget-status`);
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(false);
    });

    it("returns allowed:true with null budget_usd when no budget set", async () => {
      let selectCount = 0;
      const db = makeDb({
        select: vi.fn(() => {
          selectCount++;
          if (selectCount === 1) return makeMockQuery([mockRun]);
          if (selectCount === 2) return makeMockQuery([{ ...mockMeta, budgetUsd: null }]);
          return makeMockQuery([{ total: "999999" }]);
        }),
      });
      const app = await createApp(db);
      const res = await request(app).get(`/gstack/runs/${RUN_ID}/budget-status`);
      expect(res.status).toBe(200);
      expect(res.body.allowed).toBe(true);
      expect(res.body.budget_usd).toBeNull();
    });
  });

  // ------------------------------------------------------------------
  describe("GET /gstack/runs", () => {
    it("returns recent runs for the caller's company", async () => {
      const rows = [{ ...mockMeta, runStatus: "running", agentId: AGENT_ID }];
      const db = makeDb({ select: vi.fn(() => makeMockQuery(rows)) });
      const app = await createApp(db);
      const res = await request(app).get("/gstack/runs");
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
    });

    it("returns empty array when board actor has no companies", async () => {
      const db = makeDb();
      const app = await createApp(db, { companyIds: [] });
      const res = await request(app).get("/gstack/runs");
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
      expect(db.select).not.toHaveBeenCalled();
    });

    it("derives companyId from agent actor", async () => {
      const rows = [{ ...mockMeta, runStatus: "running" }];
      const db = makeDb({ select: vi.fn(() => makeMockQuery(rows)) });
      const app = await createApp(db, {
        type: "agent",
        agentId: AGENT_ID,
        companyId: COMPANY_ID,
        source: "api_key",
        companyIds: undefined,
      });
      const res = await request(app).get("/gstack/runs");
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
    });
  });
});
