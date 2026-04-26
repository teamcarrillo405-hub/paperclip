// Register in server/src/app.ts:
// import { formBuilderRoutes } from "./routes/form-builder.js";
// api.use(formBuilderRoutes(db));

import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { badRequest, notFound } from "../errors.js";
import { assertCompanyAccess } from "./authz.js";
import {
  createForm,
  updateForm,
  deleteForm,
  listForms,
  getForm,
  submitForm,
  listSubmissions,
  type FormField,
  type FieldType,
} from "../services/form-builder.js";

const FIELD_TYPES: FieldType[] = [
  "text",
  "textarea",
  "number",
  "email",
  "phone",
  "select",
  "multiselect",
  "checkbox",
  "date",
  "file-upload",
];

const SUBMIT_ACTIONS = [
  "create-issue",
  "send-email",
  "webhook",
  "kb-ingest",
] as const;

type SubmitAction = (typeof SUBMIT_ACTIONS)[number];

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${field} is required`);
  }
  return value;
}

function resolveCompanyId(req: import("express").Request): string {
  const q = req.query.companyId ?? req.query.company_id;
  if (typeof q === "string" && q.length > 0) return q;
  if (req.actor.type === "agent" && req.actor.companyId) {
    return req.actor.companyId;
  }
  if (
    req.actor.type === "board" &&
    Array.isArray(req.actor.companyIds) &&
    req.actor.companyIds.length > 0
  ) {
    return req.actor.companyIds[0];
  }
  throw badRequest("companyId is required");
}

function parseFields(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => {
      const type = String(item.type ?? "text");
      const safeType: FieldType = FIELD_TYPES.includes(type as FieldType)
        ? (type as FieldType)
        : "text";

      const field: FormField = {
        id:
          typeof item.id === "string" && item.id.length > 0
            ? item.id
            : Math.random().toString(36).slice(2),
        label: typeof item.label === "string" ? item.label : "",
        type: safeType,
        required: item.required === true,
      };
      if (typeof item.placeholder === "string") field.placeholder = item.placeholder;
      if (typeof item.helpText === "string") field.helpText = item.helpText;
      if (Array.isArray(item.options)) {
        field.options = item.options
          .filter((o): o is string => typeof o === "string");
      }
      if (typeof item.validation === "object" && item.validation !== null) {
        const v = item.validation as Record<string, unknown>;
        field.validation = {};
        if (typeof v.min === "number") field.validation.min = v.min;
        if (typeof v.max === "number") field.validation.max = v.max;
        if (typeof v.pattern === "string") field.validation.pattern = v.pattern;
      }
      return field;
    });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function formBuilderRoutes(_db: Db) {
  const router = Router();

  // ── Authenticated routes ────────────────────────────────────────

  // GET /forms — list forms for a company
  router.get("/forms", (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const forms = listForms(companyId);
    res.json({ forms });
  });

  // POST /forms — create a form
  router.post("/forms", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const companyId = requireString(body.companyId, "companyId");
    assertCompanyAccess(req, companyId);

    const name = requireString(body.name, "name");

    const rawAction = body.submitAction;
    if (!SUBMIT_ACTIONS.includes(rawAction as SubmitAction)) {
      throw badRequest(`submitAction must be one of: ${SUBMIT_ACTIONS.join(", ")}`);
    }

    const form = createForm(companyId, {
      name,
      description:
        typeof body.description === "string" ? body.description : undefined,
      fields: parseFields(body.fields),
      submitAction: rawAction as SubmitAction,
      submitConfig:
        typeof body.submitConfig === "object" &&
        body.submitConfig !== null &&
        !Array.isArray(body.submitConfig)
          ? (body.submitConfig as Record<string, string>)
          : {},
      isPublic: body.isPublic === true,
    });
    res.status(201).json(form);
  });

  // PUT /forms/:id — update a form
  router.put("/forms/:id", (req, res) => {
    const body = (req.body ?? {}) as Record<string, unknown>;

    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const { id } = req.params;

    const updates: Parameters<typeof updateForm>[2] = {};
    if (typeof body.name === "string") updates.name = body.name;
    if (typeof body.description === "string") updates.description = body.description;
    if (Array.isArray(body.fields)) updates.fields = parseFields(body.fields);
    if (
      typeof body.submitAction === "string" &&
      SUBMIT_ACTIONS.includes(body.submitAction as SubmitAction)
    ) {
      updates.submitAction = body.submitAction as SubmitAction;
    }
    if (typeof body.submitConfig === "object" && body.submitConfig !== null) {
      updates.submitConfig = body.submitConfig as Record<string, string>;
    }
    if (typeof body.isPublic === "boolean") updates.isPublic = body.isPublic;

    try {
      const updated = updateForm(companyId, id, updates);
      res.json(updated);
    } catch (err) {
      throw notFound(err instanceof Error ? err.message : "Form not found");
    }
  });

  // DELETE /forms/:id — delete a form
  router.delete("/forms/:id", (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const { id } = req.params;
    const forms = listForms(companyId);
    if (!forms.find((f) => f.id === id)) {
      throw notFound("Form not found");
    }

    deleteForm(companyId, id);
    res.status(204).end();
  });

  // GET /forms/:id/submissions — list submissions for a form
  router.get("/forms/:id/submissions", (req, res) => {
    const companyId = resolveCompanyId(req);
    assertCompanyAccess(req, companyId);

    const { id } = req.params;
    const submissions = listSubmissions(companyId, id);
    res.json({ submissions });
  });

  // ── Public routes (no auth required) ────────────────────────────

  // GET /forms/public/:id — return form definition for embedding
  router.get("/forms/public/:id", (req, res) => {
    const { id } = req.params;
    const form = getForm(id);
    if (!form || !form.isPublic) {
      throw notFound("Form not found");
    }

    // Return only fields needed to render the form — no internal company info
    res.json({
      id: form.id,
      name: form.name,
      description: form.description,
      fields: form.fields,
    });
  });

  // POST /forms/public/:id/submit — submit a public form
  router.post("/forms/public/:id/submit", async (req, res) => {
    const { id } = req.params;
    const form = getForm(id);
    if (!form || !form.isPublic) {
      throw notFound("Form not found");
    }

    const data = (req.body ?? {}) as Record<string, unknown>;

    try {
      const submission = await submitForm(id, data);
      res.status(201).json({ submissionId: submission.id, status: submission.status });
    } catch (err) {
      throw badRequest(err instanceof Error ? err.message : "Submission failed");
    }
  });

  return router;
}
