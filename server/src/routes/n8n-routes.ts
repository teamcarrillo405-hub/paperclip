import { Router } from "express";
import {
  N8nService,
  N8nApiError,
  N8nNotConnectedError,
  isWorkflowTemplateName,
  type WorkflowTemplateConfig,
} from "@paperclipai/plugin-n8n";
import { assertAuthenticated } from "./authz.js";
import { badRequest } from "../errors.js";

function buildService(): N8nService {
  return new N8nService();
}

function n8nErrorToHttp(err: unknown): { status: number; message: string } {
  if (err instanceof N8nNotConnectedError) return { status: 503, message: err.message };
  if (err instanceof N8nApiError) return { status: err.status >= 400 && err.status < 600 ? err.status : 502, message: err.message };
  if (err instanceof Error) return { status: 500, message: err.message };
  return { status: 500, message: String(err) };
}

export function n8nRoutes() {
  const router = Router();

  router.use("/n8n", (_req, _res, next) => {
    next();
  });

  router.get("/n8n/status", async (req, res) => {
    assertAuthenticated(req);
    const service = buildService();
    const status = await service.getStatus();
    res.json(status);
  });

  router.get("/n8n/workflows", async (req, res) => {
    assertAuthenticated(req);
    try {
      const workflows = await buildService().listWorkflowsWithLastExecution();
      res.json({ workflows });
    } catch (err) {
      const { status, message } = n8nErrorToHttp(err);
      res.status(status).json({ error: message });
    }
  });

  router.post("/n8n/workflows/:id/trigger", async (req, res) => {
    assertAuthenticated(req);
    const id = req.params.id;
    if (!id) throw badRequest("workflow id is required");
    const body = (req.body ?? {}) as { data?: unknown };
    try {
      const result = await buildService().triggerWorkflow(id, body.data);
      res.json({ ok: true, result: result ?? null });
    } catch (err) {
      const { status, message } = n8nErrorToHttp(err);
      res.status(status).json({ error: message });
    }
  });

  router.get("/n8n/workflows/:id/executions", async (req, res) => {
    assertAuthenticated(req);
    const id = req.params.id;
    if (!id) throw badRequest("workflow id is required");
    const limitRaw = req.query.limit;
    const limit = typeof limitRaw === "string" ? Number.parseInt(limitRaw, 10) : undefined;
    try {
      const executions = await buildService().getExecutions(id, Number.isFinite(limit) ? limit : 20);
      res.json({ executions });
    } catch (err) {
      const { status, message } = n8nErrorToHttp(err);
      res.status(status).json({ error: message });
    }
  });

  router.post("/n8n/workflows/from-template", async (req, res) => {
    assertAuthenticated(req);
    const body = (req.body ?? {}) as {
      templateName?: unknown;
      config?: unknown;
    };
    if (typeof body.templateName !== "string" || !isWorkflowTemplateName(body.templateName)) {
      throw badRequest(
        "templateName must be one of: lead-nurture, invoice-reminder, review-request",
      );
    }
    const rawConfig = body.config && typeof body.config === "object" && !Array.isArray(body.config)
      ? (body.config as Record<string, unknown>)
      : {};
    const variables: Record<string, string> | undefined =
      rawConfig.variables && typeof rawConfig.variables === "object" && !Array.isArray(rawConfig.variables)
        ? Object.fromEntries(
            Object.entries(rawConfig.variables as Record<string, unknown>).filter(
              ([, v]) => typeof v === "string",
            ) as Array<[string, string]>,
          )
        : undefined;
    const config: WorkflowTemplateConfig = {
      name: typeof rawConfig.name === "string" ? rawConfig.name : undefined,
      variables,
      activate: typeof rawConfig.activate === "boolean" ? rawConfig.activate : undefined,
    };
    try {
      const workflow = await buildService().createFromTemplate(body.templateName, config);
      res.json({ workflow });
    } catch (err) {
      const { status, message } = n8nErrorToHttp(err);
      res.status(status).json({ error: message });
    }
  });

  router.patch("/n8n/workflows/:id/toggle", async (req, res) => {
    assertAuthenticated(req);
    const id = req.params.id;
    if (!id) throw badRequest("workflow id is required");
    try {
      const workflow = await buildService().toggleWorkflow(id);
      res.json({ workflow });
    } catch (err) {
      const { status, message } = n8nErrorToHttp(err);
      res.status(status).json({ error: message });
    }
  });

  return router;
}
