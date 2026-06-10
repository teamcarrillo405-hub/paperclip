import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest, notFound, unauthorized } from "../errors.js";
import { assertBoard, assertCompanyAccess, assertBoardOrgAccess } from "./authz.js";
import { redactEventPayload } from "../redaction.js";
import {
  approvalService,
  issueApprovalService,
  logActivity,
} from "../services/index.js";
import { syncHccApprovalDecision } from "../services/hcc-approval-bridge.js";
import {
  createSignedReviewToken,
  createSignedReviewUrl,
  signedReviewTtlMsFromQuery,
  verifySignedReviewToken,
  type SignedReviewKind,
} from "../services/signed-review-links.js";

type ReviewDecision = "approve" | "reject" | "request-revision";

type HccQueueItem = Record<string, unknown> & {
  id?: string;
  status?: string;
  paperclip_approval_id?: string;
  file_path?: string;
  image_path?: string;
  thumbnail_path?: string;
  optimized_file?: string;
};

const DECISION_TO_STATUS: Record<ReviewDecision, string> = {
  approve: "approved",
  reject: "rejected",
  "request-revision": "revision_requested",
};

function requestOrigin(req: Request) {
  const forwardedProto = req.header("x-forwarded-proto")?.split(",")[0]?.trim();
  const forwardedHost = req.header("x-forwarded-host")?.split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "http";
  const host = forwardedHost || req.header("host");
  if (!host) throw badRequest("Cannot determine request host");
  return `${proto}://${host}`;
}

function hccRoot() {
  return path.resolve(process.env.HCC_ROOT || path.join(os.homedir(), "HCC"));
}

function hccQueuePath() {
  return path.join(hccRoot(), "approvals", "queue.json");
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireDecisionNoteForReviewDecision(decision: ReviewDecision, value: unknown) {
  const note = safeString(value);
  if ((decision === "reject" || decision === "request-revision") && !note) {
    throw badRequest(
      decision === "reject"
        ? "A note is required to reject an approval."
        : "A note is required to request changes on an approval.",
    );
  }
  return note;
}

function resolveSafeHccPath(value: unknown) {
  const raw = safeString(value);
  if (!raw) return null;
  const resolved = path.resolve(raw);
  const root = hccRoot().toLowerCase();
  if (resolved.toLowerCase() !== root && !resolved.toLowerCase().startsWith(`${root}${path.sep}`)) {
    return null;
  }
  return resolved;
}

async function readHccQueue() {
  const raw = await fs.readFile(hccQueuePath(), "utf8");
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  if (!Array.isArray(parsed)) throw new Error("HCC approval queue is not an array");
  return parsed.filter((item): item is HccQueueItem => !!item && typeof item === "object");
}

async function writeHccQueue(items: HccQueueItem[]) {
  await fs.writeFile(hccQueuePath(), `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

async function getHccQueueItem(id: string) {
  const items = await readHccQueue();
  return {
    items,
    item: items.find((entry) => entry.id === id) ?? null,
  };
}

async function findHccQueueItemForApproval(approvalId: string) {
  try {
    const items = await readHccQueue();
    return items.find((entry) => safeString(entry.paperclip_approval_id) === approvalId) ?? null;
  } catch {
    return null;
  }
}

function hccQueueAttachmentUrls(item: HccQueueItem, token: string) {
  const id = String(item.id ?? "");
  const encodedId = encodeURIComponent(id);
  const htmlPath = resolveSafeHccPath(item.file_path);
  const imagePath = resolveSafeHccPath(item.image_path ?? item.thumbnail_path ?? item.optimized_file);
  return {
    documentUrl: htmlPath ? `/api/public/review/hcc-queue/${encodedId}/document?token=${encodeURIComponent(token)}` : null,
    imageUrl: imagePath ? `/api/public/review/hcc-queue/${encodedId}/image?token=${encodeURIComponent(token)}` : null,
    reviewUrl: `/review/${encodedId}?token=${encodeURIComponent(token)}`,
  };
}

function publicHccQueueItem(item: HccQueueItem, token: string) {
  const htmlPath = resolveSafeHccPath(item.file_path);
  const imagePath = resolveSafeHccPath(item.image_path ?? item.thumbnail_path ?? item.optimized_file);
  const urls = hccQueueAttachmentUrls(item, token);
  return {
    kind: "hcc_queue" as const,
    id: String(item.id ?? ""),
    status: safeString(item.status) ?? "pending",
    title: safeString(item.title) ?? String(item.id ?? "Review item"),
    department: safeString(item.department),
    contentType: safeString(item.content_type),
    reviewKind: safeString(item.review_kind),
    contentFamily: safeString(item.content_family),
    priority: safeString(item.priority),
    summary: safeString(item.summary),
    approvalFocus: safeString(item.approval_focus),
    nextActionOnApproval: safeString(item.next_action_on_approval),
    liveArticleUrl: safeString(item.live_article_url),
    score: typeof item.score === "number" ? item.score : null,
    submittedAt: safeString(item.submitted_at),
    approvalChecklist: Array.isArray(item.approval_checklist) ? item.approval_checklist : [],
    socialDistributionPlan: Array.isArray(item.social_distribution_plan) ? item.social_distribution_plan : [],
    seoGeoAeo: item.seo_geo_aeo && typeof item.seo_geo_aeo === "object" ? item.seo_geo_aeo : null,
    revisionDetails: item.revision_details && typeof item.revision_details === "object"
      ? item.revision_details
      : null,
    hasHtml: Boolean(htmlPath),
    hasImage: Boolean(imagePath),
    documentUrl: urls.documentUrl,
    imageUrl: urls.imageUrl,
    reviewUrl: urls.reviewUrl,
    paperclipApprovalId: safeString(item.paperclip_approval_id),
  };
}

function recordPayload(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

async function publicApprovalPayload(approvalId: string, payload: unknown) {
  const redacted = redactEventPayload(recordPayload(payload)) ?? {};
  if (!redacted || typeof redacted !== "object" || Array.isArray(redacted)) return redacted;

  const hccItem = await findHccQueueItemForApproval(approvalId);
  if (!hccItem?.id) return redacted;

  const token = createSignedReviewToken({ kind: "hcc_queue", id: String(hccItem.id) });
  const urls = hccQueueAttachmentUrls(hccItem, token);
  const htmlPath = resolveSafeHccPath(hccItem.file_path);
  const imagePath = resolveSafeHccPath(hccItem.image_path ?? hccItem.thumbnail_path ?? hccItem.optimized_file);
  const revisionDetails = hccItem.revision_details && typeof hccItem.revision_details === "object"
    ? hccItem.revision_details
    : null;
  return {
    ...redacted,
    queueId: safeString(hccItem.id) ?? undefined,
    filePath: safeString(redacted.filePath) ?? htmlPath ?? undefined,
    file_path: safeString(redacted.file_path) ?? htmlPath ?? undefined,
    imagePath: safeString(redacted.imagePath) ?? imagePath ?? undefined,
    image_path: safeString(redacted.image_path) ?? imagePath ?? undefined,
    ...(revisionDetails && !recordPayload(redacted.revisionDetails) ? { revisionDetails } : {}),
    ...(urls.documentUrl ? { fullDocumentUrl: urls.documentUrl } : {}),
    ...(urls.imageUrl ? { imageUrl: urls.imageUrl } : {}),
    hccReviewUrl: urls.reviewUrl,
  };
}

async function readHccHtml(item: HccQueueItem) {
  const htmlPath = resolveSafeHccPath(item.file_path);
  if (!htmlPath) return null;
  try {
    return await fs.readFile(htmlPath, "utf8");
  } catch {
    return null;
  }
}

function resolveHccImagePath(item: HccQueueItem) {
  return resolveSafeHccPath(item.image_path ?? item.thumbnail_path ?? item.optimized_file);
}

function getToken(req: Request) {
  return typeof req.query.token === "string" ? req.query.token : undefined;
}

function assertSignedReview(req: Request, kind: SignedReviewKind, id: string) {
  const payload = verifySignedReviewToken({ token: getToken(req), kind, id });
  if (!payload) throw unauthorized("Invalid or expired signed review link");
  return payload;
}

async function resolveApprovalDecision(
  db: Db,
  approvalId: string,
  decision: ReviewDecision,
  decisionNote: string | null,
) {
  const svc = approvalService(db);
  const issueApprovals = issueApprovalService(db);
  const existing = await svc.getById(approvalId);
  if (!existing) throw notFound("Approval not found");

  const decidedByUserId = "signed-review-link";
  const result = decision === "approve"
    ? await svc.approve(approvalId, decidedByUserId, decisionNote)
    : decision === "reject"
      ? await svc.reject(approvalId, decidedByUserId, decisionNote)
      : { approval: await svc.requestRevision(approvalId, decidedByUserId, decisionNote), applied: true };

  const linkedIssues = await issueApprovals.listIssuesForApproval(approvalId);
  await logActivity(db, {
    companyId: result.approval.companyId,
    actorType: "user",
    actorId: decidedByUserId,
    action: `approval.${decision === "approve" ? "approved" : decision === "reject" ? "rejected" : "revision_requested"}`,
    entityType: "approval",
    entityId: approvalId,
    details: {
      source: "signed_review_link",
      type: result.approval.type,
      linkedIssueIds: linkedIssues.map((issue) => issue.id),
    },
  });

  try {
    await syncHccApprovalDecision(result.approval, decision, decisionNote);
  } catch {
    // The signed review link should still resolve the Paperclip approval when
    // the legacy HCC bridge is unavailable.
  }

  return result.approval;
}

async function applyHccQueueDecision(
  db: Db,
  id: string,
  decision: ReviewDecision,
  decisionNote: string | null,
) {
  const { items, item } = await getHccQueueItem(id);
  if (!item) throw notFound("Review item not found");

  let approval = null;
  const paperclipApprovalId = safeString(item.paperclip_approval_id);
  if (paperclipApprovalId) {
    approval = await resolveApprovalDecision(db, paperclipApprovalId, decision, decisionNote);
  }

  const now = new Date().toISOString();
  const updatedItems = items.map((entry) => {
    if (entry.id !== id) return entry;
    return {
      ...entry,
      status: DECISION_TO_STATUS[decision],
      decision_note: decisionNote,
      decided_by: "signed-review-link",
      decided_at: now,
      ...(decision === "approve" ? { approved_at: now, approved_by: "signed-review-link" } : {}),
      ...(decision === "reject" ? { rejected_at: now, rejected_by: "signed-review-link" } : {}),
      ...(decision === "request-revision" ? { revision_requested_at: now } : {}),
    };
  });
  await writeHccQueue(updatedItems);
  const next = updatedItems.find((entry) => entry.id === id)!;
  return { item: next, approval };
}

export function signedReviewRoutes(db: Db) {
  const router = Router();

  router.post("/review-links/approvals/:id", async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    const approval = await approvalService(db).getById(id);
    if (!approval) throw notFound("Approval not found");
    assertCompanyAccess(req, approval.companyId);
    const ttlMs = signedReviewTtlMsFromQuery(req.body?.ttlMs ?? req.query.ttlMs);
    res.json(createSignedReviewUrl({ origin: requestOrigin(req), kind: "approval", id, ttlMs }));
  });

  router.post("/review-links/hcc-queue/:id", async (req, res) => {
    assertBoardOrgAccess(req);
    const id = req.params.id as string;
    const { item } = await getHccQueueItem(id);
    if (!item) throw notFound("Review item not found");
    const ttlMs = signedReviewTtlMsFromQuery(req.body?.ttlMs ?? req.query.ttlMs);
    res.json(createSignedReviewUrl({ origin: requestOrigin(req), kind: "hcc_queue", id, ttlMs }));
  });

  router.get("/public/review/approval/:id", async (req, res) => {
    const id = req.params.id as string;
    assertSignedReview(req, "approval", id);
    const approval = await approvalService(db).getById(id);
    if (!approval) throw notFound("Approval not found");
    res.json({
      kind: "approval",
      approval: {
        ...approval,
        payload: await publicApprovalPayload(id, approval.payload),
      },
    });
  });

  router.post("/public/review/approval/:id/:decision", async (req, res) => {
    const id = req.params.id as string;
    const decision = req.params.decision as ReviewDecision;
    if (!["approve", "reject", "request-revision"].includes(decision)) throw notFound("Decision not found");
    assertSignedReview(req, "approval", id);
    const decisionNote = requireDecisionNoteForReviewDecision(decision, req.body?.decisionNote);
    const approval = await resolveApprovalDecision(db, id, decision, decisionNote);
    res.json({
      kind: "approval",
      approval: {
        ...approval,
        payload: await publicApprovalPayload(id, approval.payload),
      },
    });
  });

  router.get("/public/review/hcc-queue/:id", async (req, res) => {
    const id = req.params.id as string;
    assertSignedReview(req, "hcc_queue", id);
    const { item } = await getHccQueueItem(id);
    if (!item) throw notFound("Review item not found");
    const token = getToken(req) ?? "";
    const html = await readHccHtml(item);
    res.json({
      kind: "hcc_queue",
      item: publicHccQueueItem(item, token),
      html,
    });
  });

  router.get("/public/review/hcc-queue/:id/image", async (req, res) => {
    const id = req.params.id as string;
    assertSignedReview(req, "hcc_queue", id);
    const { item } = await getHccQueueItem(id);
    if (!item) throw notFound("Review item not found");
    const imagePath = resolveHccImagePath(item);
    if (!imagePath) throw notFound("Review image not found");
    res.sendFile(imagePath);
  });

  router.get("/public/review/hcc-queue/:id/document", async (req, res) => {
    const id = req.params.id as string;
    const { item } = await getHccQueueItem(id);
    if (!item) throw notFound("Review item not found");
    const htmlPath = resolveSafeHccPath(item.file_path);
    if (!htmlPath) throw notFound("Review document not found");
    res.sendFile(htmlPath);
  });

  router.get("/public/review/hcc-queue/:id/legacy-image", async (req, res) => {
    const id = req.params.id as string;
    const { item } = await getHccQueueItem(id);
    if (!item) throw notFound("Review item not found");
    const imagePath = resolveHccImagePath(item);
    if (!imagePath) throw notFound("Review image not found");
    res.sendFile(imagePath);
  });

  router.post("/public/review/hcc-queue/:id/:decision", async (req, res) => {
    const id = req.params.id as string;
    const decision = req.params.decision as ReviewDecision;
    if (!["approve", "reject", "request-revision"].includes(decision)) throw notFound("Decision not found");
    assertSignedReview(req, "hcc_queue", id);
    const decisionNote = requireDecisionNoteForReviewDecision(decision, req.body?.decisionNote);
    const { item, approval } = await applyHccQueueDecision(db, id, decision, decisionNote);
    const token = getToken(req) ?? "";
    res.json({
      kind: "hcc_queue",
      item: publicHccQueueItem(item, token),
      approval: approval
        ? {
            ...approval,
            payload: await publicApprovalPayload(approval.id, approval.payload),
          }
        : null,
    });
  });

  return router;
}
