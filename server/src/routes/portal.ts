// Register in server/src/app.ts:
// import { portalRoutes } from "./routes/portal.js";
// app.use("/api/portal", portalRoutes(db));  // mounted on app directly, not api router

import { randomUUID } from "node:crypto";
import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agents, issues, issueComments } from "@paperclipai/db";
import { portalAuthMiddleware } from "../middleware/portal-auth.js";
import {
  createPortalUser,
  createPortalSession,
  deletePortalSession,
  getPortalUserByEmail,
  listPortalUsers,
  deletePortalUser,
  verifyPortalUserPassword,
} from "../services/portal-store.js";
import { badRequest, notFound, unauthorized } from "../errors.js";
import { assertBoard } from "./authz.js";

function getWhitelabelBranding() {
  return {
    productName: process.env.WHITELABEL_PRODUCT_NAME ?? "Avero Enterprise",
    primaryColor: process.env.WHITELABEL_PRIMARY_COLOR ?? "#F5C518",
    logoUrl: process.env.WHITELABEL_LOGO_URL ?? null,
  };
}

export function portalRoutes(db: Db) {
  const router = Router();
  const portalAuth = portalAuthMiddleware();

  // ---------------------------------------------------------------------------
  // Public — no auth
  // ---------------------------------------------------------------------------

  // POST /auth/login
  router.post("/auth/login", async (req, res, next) => {
    try {
      const { email, password } = req.body as { email?: string; password?: string };
      if (!email?.trim() || !password) {
        throw badRequest("email and password are required");
      }

      const user = await verifyPortalUserPassword(email.trim(), password);
      if (!user) {
        throw unauthorized("Invalid email or password");
      }

      const session = await createPortalSession(user.id, user.companyId);
      res.json({
        token: session.token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          companyId: user.companyId,
        },
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /auth/logout
  router.post("/auth/logout", async (req, res, next) => {
    try {
      const { token } = req.body as { token?: string };
      if (token) {
        await deletePortalSession(token);
      }
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // GET /branding
  router.get("/branding", (_req, res) => {
    res.json(getWhitelabelBranding());
  });

  // ---------------------------------------------------------------------------
  // Protected — portal auth
  // ---------------------------------------------------------------------------

  // GET /me
  router.get("/me", portalAuth, (req, res) => {
    const user = req.portalUser!;
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      companyId: user.companyId,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt ?? null,
    });
  });

  // GET /tickets
  router.get("/tickets", portalAuth, async (req, res, next) => {
    try {
      const companyId = req.portalCompanyId!;

      const rows = await db
        .select({
          id: issues.id,
          title: issues.title,
          status: issues.status,
          createdAt: issues.createdAt,
          agentId: issues.assigneeAgentId,
          agentName: agents.name,
        })
        .from(issues)
        .leftJoin(agents, eq(issues.assigneeAgentId, agents.id))
        .where(eq(issues.companyId, companyId))
        .orderBy(desc(issues.createdAt))
        .limit(200);

      res.json(
        rows.map((row) => ({
          id: row.id,
          title: row.title,
          status: row.status,
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
          agentName: row.agentName ?? null,
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  // POST /tickets
  router.post("/tickets", portalAuth, async (req, res, next) => {
    try {
      const companyId = req.portalCompanyId!;
      const { title, description } = req.body as {
        title?: string;
        description?: string;
      };

      if (!title?.trim()) {
        throw badRequest("title is required");
      }

      const [issue] = await db
        .insert(issues)
        .values({
          id: randomUUID(),
          companyId,
          title: title.trim(),
          description: description?.trim() ?? null,
          status: "backlog",
          priority: "medium",
        })
        .returning({
          id: issues.id,
          title: issues.title,
          status: issues.status,
          createdAt: issues.createdAt,
        });

      res.status(201).json({
        id: issue!.id,
        title: issue!.title,
        status: issue!.status,
        createdAt: issue!.createdAt instanceof Date ? issue!.createdAt.toISOString() : issue!.createdAt,
        agentName: null,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /tickets/:id
  router.get("/tickets/:id", portalAuth, async (req, res, next) => {
    try {
      const companyId = req.portalCompanyId!;
      const { id } = req.params as { id: string };

      const [issue] = await db
        .select({
          id: issues.id,
          title: issues.title,
          status: issues.status,
          description: issues.description,
          createdAt: issues.createdAt,
          agentName: agents.name,
        })
        .from(issues)
        .leftJoin(agents, eq(issues.assigneeAgentId, agents.id))
        .where(and(eq(issues.id, id), eq(issues.companyId, companyId)));

      if (!issue) throw notFound("Ticket not found");

      const comments = await db
        .select({
          id: issueComments.id,
          body: issueComments.body,
          createdAt: issueComments.createdAt,
          authorUserId: issueComments.authorUserId,
          authorAgentId: issueComments.authorAgentId,
          agentName: agents.name,
        })
        .from(issueComments)
        .leftJoin(agents, eq(issueComments.authorAgentId, agents.id))
        .where(and(eq(issueComments.issueId, id), eq(issueComments.companyId, companyId)))
        .orderBy(issueComments.createdAt);

      res.json({
        id: issue.id,
        title: issue.title,
        status: issue.status,
        description: issue.description ?? null,
        createdAt: issue.createdAt instanceof Date ? issue.createdAt.toISOString() : issue.createdAt,
        agentName: issue.agentName ?? null,
        messages: comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt instanceof Date ? c.createdAt.toISOString() : c.createdAt,
          fromAgent: !!c.authorAgentId,
          authorName: c.agentName ?? null,
        })),
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /tickets/:id/messages
  router.post("/tickets/:id/messages", portalAuth, async (req, res, next) => {
    try {
      const companyId = req.portalCompanyId!;
      const { id } = req.params as { id: string };
      const { content } = req.body as { content?: string };

      if (!content?.trim()) {
        throw badRequest("content is required");
      }

      // Verify ticket belongs to this company
      const [issue] = await db
        .select({ id: issues.id, companyId: issues.companyId })
        .from(issues)
        .where(and(eq(issues.id, id), eq(issues.companyId, companyId)));

      if (!issue) throw notFound("Ticket not found");

      const [comment] = await db
        .insert(issueComments)
        .values({
          companyId,
          issueId: id,
          body: content.trim(),
          authorUserId: null,
          authorAgentId: null,
          createdByRunId: null,
        })
        .returning({
          id: issueComments.id,
          body: issueComments.body,
          createdAt: issueComments.createdAt,
        });

      // Touch the issue updatedAt
      await db
        .update(issues)
        .set({ updatedAt: new Date() })
        .where(eq(issues.id, id));

      res.status(201).json({
        id: comment!.id,
        body: comment!.body,
        createdAt: comment!.createdAt instanceof Date ? comment!.createdAt.toISOString() : comment!.createdAt,
        fromAgent: false,
        authorName: null,
      });
    } catch (err) {
      next(err);
    }
  });

  // ---------------------------------------------------------------------------
  // Admin — internal board auth
  // ---------------------------------------------------------------------------

  // POST /admin/users
  router.post("/admin/users", async (req, res, next) => {
    try {
      assertBoard(req);
      const { companyId, email, name, password } = req.body as {
        companyId?: string;
        email?: string;
        name?: string;
        password?: string;
      };
      if (!companyId?.trim()) throw badRequest("companyId is required");
      if (!email?.trim()) throw badRequest("email is required");
      if (!name?.trim()) throw badRequest("name is required");
      if (!password) throw badRequest("password is required");

      const user = await createPortalUser(
        companyId.trim(),
        email.trim(),
        name.trim(),
        password,
      );

      res.status(201).json({
        id: user.id,
        companyId: user.companyId,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt,
      });
    } catch (err) {
      next(err);
    }
  });

  // GET /admin/users?companyId=
  router.get("/admin/users", async (req, res, next) => {
    try {
      assertBoard(req);
      const companyId = (req.query as Record<string, string>).companyId?.trim();
      if (!companyId) throw badRequest("companyId query param is required");

      const users = await listPortalUsers(companyId);
      res.json(
        users.map((u) => ({
          id: u.id,
          companyId: u.companyId,
          email: u.email,
          name: u.name,
          createdAt: u.createdAt,
          lastLoginAt: u.lastLoginAt ?? null,
        })),
      );
    } catch (err) {
      next(err);
    }
  });

  // DELETE /admin/users/:id
  router.delete("/admin/users/:id", async (req, res, next) => {
    try {
      assertBoard(req);
      const { id } = req.params as { id: string };
      await deletePortalUser(id);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  return router;
}
