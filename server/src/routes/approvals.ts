import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Router, type Request } from "express";
import type { Db } from "@paperclipai/db";
import {
  addApprovalCommentSchema,
  createApprovalSchema,
  requestApprovalRevisionSchema,
  resolveApprovalSchema,
  resubmitApprovalSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { logger } from "../middleware/logger.js";
import { badRequest } from "../errors.js";
import {
  approvalService,
  heartbeatService,
  issueApprovalService,
  issueService,
  logActivity,
  secretService,
} from "../services/index.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";
import { redactEventPayload } from "../redaction.js";
import { syncHccApprovalDecision } from "../services/hcc-approval-bridge.js";

type HccQueueItem = Record<string, unknown> & {
  id?: string;
  paperclip_approval_id?: string;
  file_path?: string;
  image_path?: string;
  thumbnail_path?: string;
  optimized_file?: string;
};

function hccRoot() {
  return path.resolve(process.env.HCC_ROOT || path.join(os.homedir(), "HCC"));
}

function hccQueuePath() {
  return path.join(hccRoot(), "approvals", "queue.json");
}

function safeString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function requireDecisionNote(value: unknown, action: "reject" | "request revision") {
  const note = safeString(value);
  if (!note) throw badRequest(`A note is required to ${action} an approval.`);
  return note;
}

async function readHccQueue() {
  const raw = await fs.readFile(hccQueuePath(), "utf8");
  const parsed = JSON.parse(raw.replace(/^\uFEFF/, "")) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((item): item is HccQueueItem => !!item && typeof item === "object");
}

async function findHccQueueItemForApproval(approvalId: string, payload: Record<string, unknown>) {
  try {
    const items = await readHccQueue();
    const queueId = safeString(payload.queueId) ?? safeString(payload.hccQueueId) ?? safeString(payload.queue_id);
    return items.find((entry) => safeString(entry.paperclip_approval_id) === approvalId)
      ?? (queueId ? items.find((entry) => safeString(entry.id) === queueId) : null)
      ?? null;
  } catch {
    return null;
  }
}

function hccQueuePublicUrls(item: HccQueueItem) {
  const id = safeString(item.id);
  if (!id) return {};
  const encodedId = encodeURIComponent(id);
  const hasDocument = Boolean(safeString(item.file_path));
  const hasImage = Boolean(safeString(item.image_path) ?? safeString(item.thumbnail_path) ?? safeString(item.optimized_file));
  return {
    ...(hasDocument ? { fullDocumentUrl: `/api/public/review/hcc-queue/${encodedId}/document` } : {}),
    ...(hasImage ? { imageUrl: `/api/public/review/hcc-queue/${encodedId}/legacy-image` } : {}),
    hccReviewUrl: `/review/${encodedId}`,
  };
}

async function redactApprovalPayload<T extends { id: string; payload: Record<string, unknown> }>(approval: T): Promise<T> {
  const payload = redactEventPayload(approval.payload) ?? {};
  const hccItem = await findHccQueueItemForApproval(approval.id, payload);
  const hccUrls = hccItem ? hccQueuePublicUrls(hccItem) : {};

  return {
    ...approval,
    payload: {
      ...payload,
      ...hccUrls,
    },
  };
}

export function approvalRoutes(db: Db) {
  const router = Router();
  const svc = approvalService(db);
  const heartbeat = heartbeatService(db);
  const issueApprovalsSvc = issueApprovalService(db);
  const issuesSvc = issueService(db);
  const secretsSvc = secretService(db);
  const strictSecretsMode = process.env.PAPERCLIP_SECRETS_STRICT_MODE === "true";

  async function requireApprovalAccess(req: Request, id: string) {
    const approval = await svc.getById(id);
    if (!approval) {
      return null;
    }
    assertCompanyAccess(req, approval.companyId);
    return approval;
  }

  async function queueRequesterWakeupForApprovalDecision(
    approval: {
      id: string;
      companyId: string;
      requestedByAgentId: string | null;
      status: string;
    },
    reason: "approval_rejected" | "approval_revision_requested",
    actorUserId: string,
  ) {
    const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(approval.id);
    const linkedIssueIds = linkedIssues.map((issue) => issue.id);
    const primaryIssueId = linkedIssueIds[0] ?? null;

    if (!approval.requestedByAgentId) {
      return { wakeRunId: null, linkedIssueIds };
    }

    try {
      const wakeRun = await heartbeat.wakeup(approval.requestedByAgentId, {
        source: "automation",
        triggerDetail: "system",
        reason,
        payload: {
          approvalId: approval.id,
          approvalStatus: approval.status,
          issueId: primaryIssueId,
          issueIds: linkedIssueIds,
        },
        requestedByActorType: "user",
        requestedByActorId: actorUserId,
        contextSnapshot: {
          source: `approval.${reason === "approval_rejected" ? "rejected" : "revision_requested"}`,
          approvalId: approval.id,
          approvalStatus: approval.status,
          issueId: primaryIssueId,
          issueIds: linkedIssueIds,
          taskId: primaryIssueId,
          wakeReason: reason,
        },
      });

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: actorUserId,
        action: "approval.requester_wakeup_queued",
        entityType: "approval",
        entityId: approval.id,
        details: {
          requesterAgentId: approval.requestedByAgentId,
          wakeRunId: wakeRun?.id ?? null,
          linkedIssueIds,
          reason,
        },
      });

      return { wakeRunId: wakeRun?.id ?? null, linkedIssueIds };
    } catch (err) {
      logger.warn(
        {
          err,
          approvalId: approval.id,
          requestedByAgentId: approval.requestedByAgentId,
          reason,
        },
        "failed to queue requester wakeup after approval decision",
      );
      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: actorUserId,
        action: "approval.requester_wakeup_failed",
        entityType: "approval",
        entityId: approval.id,
        details: {
          requesterAgentId: approval.requestedByAgentId,
          linkedIssueIds,
          reason,
          error: err instanceof Error ? err.message : String(err),
        },
      });
      return { wakeRunId: null, linkedIssueIds };
    }
  }

  async function postLinkedIssueDecisionComments(
    linkedIssueIds: string[],
    approvalId: string,
    decisionNote: string | null | undefined,
    actorUserId: string,
  ) {
    if (linkedIssueIds.length === 0) return;

    const note = decisionNote?.trim();
    const body = note && note.length > 0
      ? `Board changes requested on approval ${approvalId}. ${note}`
      : `Board changes requested on approval ${approvalId}. Please revise and resubmit.`;

    await Promise.all(
      linkedIssueIds.map(async (issueId) => {
        try {
          await issuesSvc.addComment(issueId, body, { userId: actorUserId });
        } catch (err) {
          logger.warn(
            { err, approvalId, issueId },
            "failed to add board follow-up comment for approval decision",
          );
        }
      }),
    );
  }

  router.get("/companies/:companyId/approvals", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const status = req.query.status as string | undefined;
    const result = await svc.list(companyId, status);
    res.json(await Promise.all(result.map((approval) => redactApprovalPayload(approval))));
  });

  router.get("/approvals/:id", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    res.json(await redactApprovalPayload(approval));
  });

  router.post("/companies/:companyId/approvals", validate(createApprovalSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rawIssueIds = req.body.issueIds;
    const issueIds = Array.isArray(rawIssueIds)
      ? rawIssueIds.filter((value: unknown): value is string => typeof value === "string")
      : [];
    const uniqueIssueIds = Array.from(new Set(issueIds));
    const { issueIds: _issueIds, ...approvalInput } = req.body;
    const normalizedPayload =
      approvalInput.type === "hire_agent"
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            companyId,
            approvalInput.payload,
            { strictMode: strictSecretsMode },
          )
        : approvalInput.payload;

    const actor = getActorInfo(req);
    const approval = await svc.create(companyId, {
      ...approvalInput,
      payload: normalizedPayload,
      requestedByUserId: actor.actorType === "user" ? actor.actorId : null,
      requestedByAgentId:
        approvalInput.requestedByAgentId ?? (actor.actorType === "agent" ? actor.actorId : null),
      status: "pending",
      decisionNote: null,
      decidedByUserId: null,
      decidedAt: null,
      updatedAt: new Date(),
    });

    if (uniqueIssueIds.length > 0) {
      await issueApprovalsSvc.linkManyForApproval(approval.id, uniqueIssueIds, {
        agentId: actor.agentId,
        userId: actor.actorType === "user" ? actor.actorId : null,
      });
    }

    await logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.created",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type, issueIds: uniqueIssueIds },
    });

    res.status(201).json(await redactApprovalPayload(approval));
  });

  router.get("/approvals/:id/issues", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const issues = await issueApprovalsSvc.listIssuesForApproval(id);
    res.json(issues);
  });

  router.post("/approvals/:id/approve", validate(resolveApprovalSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    if (!(await requireApprovalAccess(req, id))) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    const decidedByUserId = req.actor.userId ?? "board";
    const { approval, applied } = await svc.approve(id, decidedByUserId, req.body.decisionNote);

    if (applied) {
      const linkedIssues = await issueApprovalsSvc.listIssuesForApproval(approval.id);
      const linkedIssueIds = linkedIssues.map((issue) => issue.id);
      const primaryIssueId = linkedIssueIds[0] ?? null;

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "approval.approved",
        entityType: "approval",
        entityId: approval.id,
        details: {
          type: approval.type,
          requestedByAgentId: approval.requestedByAgentId,
          linkedIssueIds,
        },
      });

      if (approval.requestedByAgentId) {
        try {
          const wakeRun = await heartbeat.wakeup(approval.requestedByAgentId, {
            source: "automation",
            triggerDetail: "system",
            reason: "approval_approved",
            payload: {
              approvalId: approval.id,
              approvalStatus: approval.status,
              issueId: primaryIssueId,
              issueIds: linkedIssueIds,
            },
            requestedByActorType: "user",
            requestedByActorId: req.actor.userId ?? "board",
            contextSnapshot: {
              source: "approval.approved",
              approvalId: approval.id,
              approvalStatus: approval.status,
              issueId: primaryIssueId,
              issueIds: linkedIssueIds,
              taskId: primaryIssueId,
              wakeReason: "approval_approved",
            },
          });

          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.requester_wakeup_queued",
            entityType: "approval",
            entityId: approval.id,
            details: {
              requesterAgentId: approval.requestedByAgentId,
              wakeRunId: wakeRun?.id ?? null,
              linkedIssueIds,
            },
          });
        } catch (err) {
          logger.warn(
            {
              err,
              approvalId: approval.id,
              requestedByAgentId: approval.requestedByAgentId,
            },
            "failed to queue requester wakeup after approval",
          );
          await logActivity(db, {
            companyId: approval.companyId,
            actorType: "user",
            actorId: req.actor.userId ?? "board",
            action: "approval.requester_wakeup_failed",
            entityType: "approval",
            entityId: approval.id,
            details: {
              requesterAgentId: approval.requestedByAgentId,
              linkedIssueIds,
              error: err instanceof Error ? err.message : String(err),
            },
          });
        }
      }

      try {
        await syncHccApprovalDecision(approval, "approve", req.body.decisionNote);
      } catch (err) {
        logger.warn({ err, approvalId: approval.id }, "failed to sync approved HCC approval");
      }
    }

    res.json(await redactApprovalPayload(approval));
  });

  router.post("/approvals/:id/reject", validate(resolveApprovalSchema), async (req, res) => {
    assertBoard(req);
    const id = req.params.id as string;
    if (!(await requireApprovalAccess(req, id))) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    const decisionNote = requireDecisionNote(req.body.decisionNote, "reject");
    const decidedByUserId = req.actor.userId ?? "board";
    const { approval, applied } = await svc.reject(id, decidedByUserId, decisionNote);

    if (applied) {
      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "approval.rejected",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type },
      });

      const wakeupResult = await queueRequesterWakeupForApprovalDecision(
        approval,
        "approval_rejected",
        req.actor.userId ?? "board",
      );
      await postLinkedIssueDecisionComments(
        wakeupResult.linkedIssueIds,
        approval.id,
        decisionNote,
        req.actor.userId ?? "board",
      );

      try {
        await syncHccApprovalDecision(approval, "reject", decisionNote);
      } catch (err) {
        logger.warn({ err, approvalId: approval.id }, "failed to sync rejected HCC approval");
      }
    }

    res.json(await redactApprovalPayload(approval));
  });

  router.post(
    "/approvals/:id/request-revision",
    validate(requestApprovalRevisionSchema),
    async (req, res) => {
      assertBoard(req);
      const id = req.params.id as string;
      if (!(await requireApprovalAccess(req, id))) {
        res.status(404).json({ error: "Approval not found" });
        return;
      }
      const decisionNote = requireDecisionNote(req.body.decisionNote, "request revision");
      const decidedByUserId = req.actor.userId ?? "board";
      const approval = await svc.requestRevision(id, decidedByUserId, decisionNote);

      await logActivity(db, {
        companyId: approval.companyId,
        actorType: "user",
        actorId: req.actor.userId ?? "board",
        action: "approval.revision_requested",
        entityType: "approval",
        entityId: approval.id,
        details: { type: approval.type },
      });

      const wakeupResult = await queueRequesterWakeupForApprovalDecision(
        approval,
        "approval_revision_requested",
        req.actor.userId ?? "board",
      );
      await postLinkedIssueDecisionComments(
        wakeupResult.linkedIssueIds,
        approval.id,
        decisionNote,
        req.actor.userId ?? "board",
      );

      try {
        await syncHccApprovalDecision(approval, "request-revision", decisionNote);
      } catch (err) {
        logger.warn({ err, approvalId: approval.id }, "failed to sync HCC approval revision request");
      }

      res.json(await redactApprovalPayload(approval));
    },
  );

  router.post("/approvals/:id/resubmit", validate(resubmitApprovalSchema), async (req, res) => {
    const id = req.params.id as string;
    const existing = await svc.getById(id);
    if (!existing) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, existing.companyId);

    if (req.actor.type === "agent" && req.actor.agentId !== existing.requestedByAgentId) {
      res.status(403).json({ error: "Only requesting agent can resubmit this approval" });
      return;
    }

    const normalizedPayload = req.body.payload
      ? existing.type === "hire_agent"
        ? await secretsSvc.normalizeHireApprovalPayloadForPersistence(
            existing.companyId,
            req.body.payload,
            { strictMode: strictSecretsMode },
          )
        : req.body.payload
      : undefined;
    const approval = await svc.resubmit(id, normalizedPayload);
    const actor = getActorInfo(req);
    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.resubmitted",
      entityType: "approval",
      entityId: approval.id,
      details: { type: approval.type },
    });
    res.json(await redactApprovalPayload(approval));
  });

  router.get("/approvals/:id/comments", async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const comments = await svc.listComments(id);
    res.json(comments);
  });

  router.post("/approvals/:id/comments", validate(addApprovalCommentSchema), async (req, res) => {
    const id = req.params.id as string;
    const approval = await svc.getById(id);
    if (!approval) {
      res.status(404).json({ error: "Approval not found" });
      return;
    }
    assertCompanyAccess(req, approval.companyId);
    const actor = getActorInfo(req);
    const comment = await svc.addComment(id, req.body.body, {
      agentId: actor.agentId ?? undefined,
      userId: actor.actorType === "user" ? actor.actorId : undefined,
    });

    await logActivity(db, {
      companyId: approval.companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      action: "approval.comment_added",
      entityType: "approval",
      entityId: approval.id,
      details: { commentId: comment.id },
    });

    res.status(201).json(comment);
  });

  return router;
}
