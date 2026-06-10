import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockApprovalService = vi.hoisted(() => ({
  getById: vi.fn(),
  approve: vi.fn(),
  reject: vi.fn(),
  requestRevision: vi.fn(),
}));

const mockIssueApprovalService = vi.hoisted(() => ({
  listIssuesForApproval: vi.fn(),
}));

const mockLogActivity = vi.hoisted(() => vi.fn());
const mockSyncHccApprovalDecision = vi.hoisted(() => vi.fn());

function registerModuleMocks() {
  vi.doMock("../services/index.js", () => ({
    approvalService: () => mockApprovalService,
    issueApprovalService: () => mockIssueApprovalService,
    logActivity: mockLogActivity,
  }));
  vi.doMock("../services/hcc-approval-bridge.js", () => ({
    syncHccApprovalDecision: mockSyncHccApprovalDecision,
  }));
}

async function createApp(actor: Record<string, unknown> = { type: "none", source: "none" }) {
  const [{ errorHandler }, { signedReviewRoutes }] = await Promise.all([
    import("../middleware/index.js"),
    import("../routes/signed-review.js"),
  ]);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).actor = actor;
    next();
  });
  app.use("/api", signedReviewRoutes({} as any));
  app.use(errorHandler);
  return app;
}

describe("signed review routes", () => {
  let tempHccRoot: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    vi.doUnmock("../routes/signed-review.js");
    vi.doUnmock("../services/signed-review-links.js");
    vi.doUnmock("../middleware/index.js");
    registerModuleMocks();
    vi.resetAllMocks();
    process.env.PAPERCLIP_SIGNED_REVIEW_SECRET = "test-review-secret";
    mockIssueApprovalService.listIssuesForApproval.mockResolvedValue([{ id: "issue-1" }]);
    mockLogActivity.mockResolvedValue(undefined);
    mockSyncHccApprovalDecision.mockResolvedValue({ skipped: true });
  });

  afterEach(async () => {
    delete process.env.HCC_ROOT;
    if (tempHccRoot) {
      await fs.rm(tempHccRoot, { recursive: true, force: true });
      tempHccRoot = null;
    }
  });

  it("allows a signed review link to read an approval without a board session", async () => {
    const { createSignedReviewToken } = await import("../services/signed-review-links.js");
    const token = createSignedReviewToken({ kind: "approval", id: "approval-1" });
    mockApprovalService.getById.mockResolvedValue({
      id: "approval-1",
      companyId: "company-1",
      type: "request_board_approval",
      status: "pending",
      payload: { title: "Review this" },
    });

    const app = await createApp();
    const res = await request(app).get(`/api/public/review/approval/approval-1?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.body.approval).toMatchObject({
      id: "approval-1",
      status: "pending",
      payload: { title: "Review this" },
    });
  });

  it("rejects public approval review without a valid token", async () => {
    const app = await createApp();
    const res = await request(app).get("/api/public/review/approval/approval-1?token=bad");

    expect(res.status).toBe(401);
  });

  it("records a signed approval decision without a board session", async () => {
    const { createSignedReviewToken } = await import("../services/signed-review-links.js");
    const token = createSignedReviewToken({ kind: "approval", id: "approval-1" });
    mockApprovalService.getById.mockResolvedValue({
      id: "approval-1",
      companyId: "company-1",
      type: "request_board_approval",
      status: "pending",
      payload: { title: "Review this" },
    });
    mockApprovalService.approve.mockResolvedValue({
      approval: {
        id: "approval-1",
        companyId: "company-1",
        type: "request_board_approval",
        status: "approved",
        payload: { title: "Review this" },
      },
      applied: true,
    });

    const app = await createApp();
    const res = await request(app)
      .post(`/api/public/review/approval/approval-1/approve?token=${encodeURIComponent(token)}`)
      .send({ decisionNote: "Looks good" });

    expect(res.status).toBe(200);
    expect(mockApprovalService.approve).toHaveBeenCalledWith("approval-1", "signed-review-link", "Looks good");
    expect(res.body.approval.status).toBe("approved");
  });

  it("requires a note when a signed review link rejects an approval", async () => {
    const { createSignedReviewToken } = await import("../services/signed-review-links.js");
    const token = createSignedReviewToken({ kind: "approval", id: "approval-1" });

    const app = await createApp();
    const res = await request(app)
      .post(`/api/public/review/approval/approval-1/reject?token=${encodeURIComponent(token)}`)
      .send({ decisionNote: " " });

    expect(res.status).toBe(400);
    expect(mockApprovalService.reject).not.toHaveBeenCalled();
  });

  it("rewrites HCC attachment links in signed approval payloads", async () => {
    const { createSignedReviewToken } = await import("../services/signed-review-links.js");
    tempHccRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-hcc-review-"));
    process.env.HCC_ROOT = tempHccRoot;
    await fs.mkdir(path.join(tempHccRoot, "approvals"), { recursive: true });
    const documentPath = path.join(tempHccRoot, "approvals", "hcc-1.html");
    const imagePath = path.join(tempHccRoot, "approvals", "hcc-1.png");
    await fs.writeFile(documentPath, "<!doctype html><h1>Public attachment</h1>", "utf8");
    await fs.writeFile(imagePath, "fake image", "utf8");
    await fs.writeFile(
      path.join(tempHccRoot, "approvals", "queue.json"),
      JSON.stringify([
        {
          id: "hcc-1",
          file_path: documentPath,
          image_path: imagePath,
          paperclip_approval_id: "approval-1",
          status: "pending",
          title: "HCC queue review",
          revision_details: {
            what_changed: "Image only",
            unchanged: ["Copy"],
          },
        },
      ]),
      "utf8",
    );
    const token = createSignedReviewToken({ kind: "approval", id: "approval-1" });
    mockApprovalService.getById.mockResolvedValue({
      id: "approval-1",
      companyId: "company-1",
      type: "request_board_approval",
      status: "pending",
      payload: {
        title: "Review this",
        fullDocumentUrl: "https://old-ngrok.example/doc/hcc-1",
        imageUrl: "https://old-ngrok.example/img/hcc-1",
        hccReviewUrl: "https://old-ngrok.example/review/hcc-1",
      },
    });

    const app = await createApp();
    const res = await request(app).get(`/api/public/review/approval/approval-1?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.body.approval.payload.queueId).toBe("hcc-1");
    expect(res.body.approval.payload.filePath).toBe(documentPath);
    expect(res.body.approval.payload.imagePath).toBe(imagePath);
    expect(res.body.approval.payload.revisionDetails).toMatchObject({
      what_changed: "Image only",
      unchanged: ["Copy"],
    });
    expect(res.body.approval.payload.fullDocumentUrl).toContain("/api/public/review/hcc-queue/hcc-1/document?token=");
    expect(res.body.approval.payload.imageUrl).toContain("/api/public/review/hcc-queue/hcc-1/image?token=");
    expect(res.body.approval.payload.hccReviewUrl).toContain("/review/hcc-1?token=");
  });

  it("creates signed review links only for board users with company access", async () => {
    mockApprovalService.getById.mockResolvedValue({
      id: "approval-1",
      companyId: "company-1",
      type: "request_board_approval",
      status: "pending",
      payload: {},
    });
    const app = await createApp({
      type: "board",
      userId: "user-1",
      companyIds: ["company-1"],
      source: "session",
      isInstanceAdmin: false,
    });

    const res = await request(app)
      .post("/api/review-links/approvals/approval-1")
      .set("Host", "favoring-unruffled-brisket.ngrok-free.dev");

    expect(res.status).toBe(200);
    expect(res.body.url).toContain("/review/approval/approval-1?token=");
  });

  it("reads BOM-prefixed HCC queue files through a signed review link", async () => {
    const { createSignedReviewToken } = await import("../services/signed-review-links.js");
    tempHccRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-hcc-review-"));
    process.env.HCC_ROOT = tempHccRoot;
    await fs.mkdir(path.join(tempHccRoot, "approvals"), { recursive: true });
    await fs.writeFile(
      path.join(tempHccRoot, "approvals", "queue.json"),
      `\uFEFF${JSON.stringify([
        {
          id: "hcc-1",
          status: "pending",
          title: "HCC queue review",
          department: "creative",
        },
      ])}`,
      "utf8",
    );
    const token = createSignedReviewToken({ kind: "hcc_queue", id: "hcc-1" });

    const app = await createApp();
    const res = await request(app).get(`/api/public/review/hcc-queue/hcc-1?token=${encodeURIComponent(token)}`);

    expect(res.status).toBe(200);
    expect(res.body.item).toMatchObject({
      id: "hcc-1",
      title: "HCC queue review",
      status: "pending",
    });
  });

  it("requires a note when a signed HCC review link requests changes", async () => {
    const { createSignedReviewToken } = await import("../services/signed-review-links.js");
    tempHccRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-hcc-review-"));
    process.env.HCC_ROOT = tempHccRoot;
    await fs.mkdir(path.join(tempHccRoot, "approvals"), { recursive: true });
    await fs.writeFile(
      path.join(tempHccRoot, "approvals", "queue.json"),
      JSON.stringify([{ id: "hcc-1", status: "pending", title: "HCC queue review" }]),
      "utf8",
    );
    const token = createSignedReviewToken({ kind: "hcc_queue", id: "hcc-1" });

    const app = await createApp();
    const res = await request(app)
      .post(`/api/public/review/hcc-queue/hcc-1/request-revision?token=${encodeURIComponent(token)}`)
      .send({ decisionNote: "" });

    expect(res.status).toBe(400);
    expect(mockApprovalService.requestRevision).not.toHaveBeenCalled();
  });

  it("serves legacy HCC document attachments without a board session", async () => {
    tempHccRoot = await fs.mkdtemp(path.join(os.tmpdir(), "paperclip-hcc-review-"));
    process.env.HCC_ROOT = tempHccRoot;
    await fs.mkdir(path.join(tempHccRoot, "approvals"), { recursive: true });
    const documentPath = path.join(tempHccRoot, "approvals", "hcc-1.html");
    await fs.writeFile(documentPath, "<!doctype html><h1>Public attachment</h1>", "utf8");
    await fs.writeFile(
      path.join(tempHccRoot, "approvals", "queue.json"),
      JSON.stringify([{ id: "hcc-1", file_path: documentPath, status: "pending", title: "HCC queue review" }]),
      "utf8",
    );

    const app = await createApp();
    const res = await request(app).get("/api/public/review/hcc-queue/hcc-1/document");

    expect(res.status).toBe(200);
    expect(res.text).toContain("Public attachment");
  });
});
