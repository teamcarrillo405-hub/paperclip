import express from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---- Service mocks --------------------------------------------------

const mockApprovalService = vi.hoisted(() => ({
  list: vi.fn(),
  getById: vi.fn(),
  create: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  requestRevision: vi.fn(),
  resubmit: vi.fn(),
  listComments: vi.fn(),
  addComment: vi.fn(),
}));

const mockHeartbeatService = vi.hoisted(() => ({
  wakeup: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  listIssuesForApproval: vi.fn(),
  linkManyForApproval: vi.fn(),
}));

const mockIssueService = vi.hoisted(() => ({
  addComment: vi.fn(),
}));

const mockSecretService = vi.hoisted(() => ({
  normalizeHireApprovalPayloadForPersistence: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    approvalService: () => mockApprovalService,
    heartbeatService: () => mockHeartbeatService,
    issueApprovalService: () => mockIssueApprovalService,
    issueService: () => mockIssueService,
    logActivity: mockLogActivity,
    secretService: () => mockSecretService,
  }));
  vi.doMock("../services/hcc-approval-bridge.js", () => ({
    syncHccApprovalDecision: vi.fn().mockResolvedValue(undefined),
  }));
}

// ---- Mock DB helpers ------------------------------------------------

function makeMockQuery(returnValue: unknown) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "where", "innerJoin", "orderBy", "limit", "set", "values", "returning"]) {
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
    select: vi.fn(() => makeMockQuery([])),
    insert: vi.fn(() => makeMockQuery([])),
    update: vi.fn(() => makeMockQuery([])),
    ...overrides,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

// ---- Fixtures -------------------------------------------------------

const COMPANY_ID = "company-1";
const REQUESTING_AGENT_ID = "agent-social-media";
const TARGET_AGENT_ID = "agent-scheduler";
const APPROVAL_ID = "approval-1";
const GSTACK_RUN_ID = "a1b2c3d4-0000-0000-0000-000000000001";

function makeApproval(overrides: Record<string, unknown> = {}) {
  return {
    id: APPROVAL_ID,
    companyId: COMPANY_ID,
    type: "request_board_approval",
    requestedByAgentId: REQUESTING_AGENT_ID,
    requestedByUserId: null,
    status: "approved",
    payload: { content_type: "quad-social-post", file_path: "/posts/draft.html" },
    gstackRunId: GSTACK_RUN_ID,
    decisionNote: null,
    decidedByUserId: "user-1",
    decidedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---- App factory ----------------------------------------------------

async function createApp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  actorOverrides: Record<string, unknown> = {},
) {
  const [{ errorHandler }, { approvalRoutes }] = await Promise.all([
    import("../middleware/index.js"),
    import("../routes/approvals.js"),
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
  app.use("/api", approvalRoutes(db));
  app.use(errorHandler);
  return app;
}

// ---- Tests ----------------------------------------------------------

describe("gstack approval trigger (Approach A)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../services/index.js");
    vi.doUnmock("../services/hcc-approval-bridge.js");
    vi.doUnmock("../routes/approvals.js");
    vi.doUnmock("../routes/authz.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.resetAllMocks();

    mockApprovalService.listComments.mockResolvedValue([]);
    mockIssueApprovalService.listIssuesForApproval.mockResolvedValue([]);
    mockIssueService.addComment.mockResolvedValue(undefined);
    mockLogActivity.mockResolvedValue(undefined);
    mockHeartbeatService.wakeup.mockResolvedValue({ id: "wake-run-1" });
    mockSecretService.normalizeHireApprovalPayloadForPersistence.mockImplementation(
      (_companyId: unknown, payload: unknown) => Promise.resolve(payload),
    );
  });

  // ------------------------------------------------------------------
  describe("POST /approvals/:id/approve — trigger next agent", () => {
    it("wakes the target agent when requesting agent has on_approval_trigger configured", async () => {
      const approval = makeApproval();
      mockApprovalService.getById.mockResolvedValue(approval);
      mockApprovalService.approve.mockResolvedValue({ approval, applied: true });

      // db.select calls: 1st = agent lookup, 2nd = gstack metadata lookup
      let selectCount = 0;
      const db = makeDb({
        select: vi.fn(() => {
          selectCount++;
          if (selectCount === 1) {
            // agent lookup → has on_approval_trigger
            return makeMockQuery([{ onApprovalTrigger: { agentId: TARGET_AGENT_ID, skill: "blotato-schedule" } }]);
          }
          // gstack metadata lookup → has artifact
          return makeMockQuery([{ artifactJson: { paths: ["post.html"] } }]);
        }),
      });

      const app = await createApp(db);
      const res = await request(app).post(`/api/approvals/${APPROVAL_ID}/approve`).send({});

      expect(res.status).toBe(200);
      // heartbeat.wakeup called twice: once for requester, once for trigger target
      expect(mockHeartbeatService.wakeup).toHaveBeenCalledTimes(2);
      const triggerCall = mockHeartbeatService.wakeup.mock.calls.find(
        (call) => call[0] === TARGET_AGENT_ID,
      );
      expect(triggerCall).toBeDefined();
      expect(triggerCall?.[1]).toMatchObject({
        source: "automation",
        reason: "approval_approved",
        contextSnapshot: expect.objectContaining({
          source: "approval.trigger",
          artifactJson: { paths: ["post.html"] },
          skill: "blotato-schedule",
          approvalId: APPROVAL_ID,
        }),
      });
    });

    it("does NOT wake a target agent when on_approval_trigger is not set", async () => {
      const approval = makeApproval();
      mockApprovalService.getById.mockResolvedValue(approval);
      mockApprovalService.approve.mockResolvedValue({ approval, applied: true });

      const db = makeDb({
        select: vi.fn(() => makeMockQuery([{ onApprovalTrigger: null }])),
      });

      const app = await createApp(db);
      const res = await request(app).post(`/api/approvals/${APPROVAL_ID}/approve`).send({});

      expect(res.status).toBe(200);
      // Only the requester wakeup fires, not a trigger wakeup
      expect(mockHeartbeatService.wakeup).toHaveBeenCalledTimes(1);
      expect(mockHeartbeatService.wakeup).toHaveBeenCalledWith(
        REQUESTING_AGENT_ID,
        expect.anything(),
      );
    });

    it("does NOT query db for trigger when approval has no gstackRunId", async () => {
      const approval = makeApproval({ gstackRunId: null });
      mockApprovalService.getById.mockResolvedValue(approval);
      mockApprovalService.approve.mockResolvedValue({ approval, applied: true });

      const db = makeDb();
      const app = await createApp(db);
      const res = await request(app).post(`/api/approvals/${APPROVAL_ID}/approve`).send({});

      expect(res.status).toBe(200);
      // No db.select for trigger (only requester wakeup fires)
      expect(db.select).not.toHaveBeenCalled();
      expect(mockHeartbeatService.wakeup).toHaveBeenCalledTimes(1);
    });

    it("approval succeeds even when trigger wakeup throws", async () => {
      const approval = makeApproval();
      mockApprovalService.getById.mockResolvedValue(approval);
      mockApprovalService.approve.mockResolvedValue({ approval, applied: true });

      const db = makeDb({
        select: vi.fn(() =>
          makeMockQuery([{ onApprovalTrigger: { agentId: TARGET_AGENT_ID } }]),
        ),
      });

      // Second wakeup call (for trigger target) throws
      mockHeartbeatService.wakeup
        .mockResolvedValueOnce({ id: "wake-run-1" }) // requester wakeup succeeds
        .mockRejectedValueOnce(new Error("db connection lost")); // trigger wakeup fails

      const app = await createApp(db);
      const res = await request(app).post(`/api/approvals/${APPROVAL_ID}/approve`).send({});

      // Approval still returns 200 — trigger failure is swallowed
      expect(res.status).toBe(200);
    });

    it("does NOT trigger when applied is false (idempotent re-approve)", async () => {
      const approval = makeApproval();
      mockApprovalService.getById.mockResolvedValue(approval);
      // applied: false means this was already approved (idempotent call)
      mockApprovalService.approve.mockResolvedValue({ approval, applied: false });

      const db = makeDb();
      const app = await createApp(db);
      const res = await request(app).post(`/api/approvals/${APPROVAL_ID}/approve`).send({});

      expect(res.status).toBe(200);
      expect(mockHeartbeatService.wakeup).not.toHaveBeenCalled();
      expect(db.select).not.toHaveBeenCalled();
    });
  });

  // ------------------------------------------------------------------
  describe("POST /companies/:companyId/approvals — gstackRunId stored", () => {
    it("passes gstackRunId through to the service create call", async () => {
      const created = makeApproval({ status: "pending", decidedByUserId: null, decidedAt: null });
      mockApprovalService.create.mockResolvedValue(created);
      mockIssueApprovalService.linkManyForApproval.mockResolvedValue(undefined);

      const db = makeDb();
      const app = await createApp(db);

      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/approvals`)
        .send({
          type: "request_board_approval",
          payload: { content_type: "quad-social-post" },
          gstackRunId: GSTACK_RUN_ID,
        });

      expect([200, 201]).toContain(res.status);
      expect(mockApprovalService.create).toHaveBeenCalledWith(
        COMPANY_ID,
        expect.objectContaining({ gstackRunId: GSTACK_RUN_ID }),
      );
    });

    it("creates approval without gstackRunId when field is omitted", async () => {
      const created = makeApproval({ gstackRunId: null, status: "pending", decidedByUserId: null, decidedAt: null });
      mockApprovalService.create.mockResolvedValue(created);

      const db = makeDb();
      const app = await createApp(db);

      const res = await request(app)
        .post(`/api/companies/${COMPANY_ID}/approvals`)
        .send({
          type: "request_board_approval",
          payload: { content_type: "quad-social-post" },
        });

      expect([200, 201]).toContain(res.status);
      // gstackRunId should be absent or null in the create call
      const createArgs = mockApprovalService.create.mock.calls[0][1];
      expect(createArgs.gstackRunId ?? null).toBeNull();
    });
  });
});
