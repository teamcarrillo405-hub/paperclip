import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type FieldType =
  | "text"
  | "textarea"
  | "number"
  | "email"
  | "phone"
  | "select"
  | "multiselect"
  | "checkbox"
  | "date"
  | "file-upload";

export type FormField = {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string };
};

export type FormDefinition = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  fields: FormField[];
  submitAction: "create-issue" | "send-email" | "webhook" | "kb-ingest";
  submitConfig: Record<string, string>;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
};

export type FormSubmission = {
  id: string;
  formId: string;
  companyId: string;
  data: Record<string, unknown>;
  submittedAt: string;
  status: "pending" | "processed" | "error";
  resultUrl?: string;
};

type DefinitionsFile = FormDefinition[];
type SubmissionsFile = FormSubmission[];

function formsDir(companyId: string): string {
  return path.resolve(
    resolvePaperclipInstanceRoot(),
    "data",
    "forms",
    companyId,
  );
}

function definitionsPath(companyId: string): string {
  return path.join(formsDir(companyId), "definitions.json");
}

function submissionsPath(companyId: string): string {
  return path.join(formsDir(companyId), "submissions.json");
}

function readDefinitions(companyId: string): DefinitionsFile {
  const p = definitionsPath(companyId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as DefinitionsFile;
  } catch {
    return [];
  }
}

function writeDefinitions(companyId: string, defs: DefinitionsFile): void {
  fs.mkdirSync(formsDir(companyId), { recursive: true });
  fs.writeFileSync(definitionsPath(companyId), JSON.stringify(defs, null, 2));
}

function readSubmissions(companyId: string): SubmissionsFile {
  const p = submissionsPath(companyId);
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as SubmissionsFile;
  } catch {
    return [];
  }
}

function writeSubmissions(companyId: string, subs: SubmissionsFile): void {
  fs.mkdirSync(formsDir(companyId), { recursive: true });
  fs.writeFileSync(submissionsPath(companyId), JSON.stringify(subs, null, 2));
}

export function createForm(
  companyId: string,
  def: Omit<FormDefinition, "id" | "companyId" | "createdAt" | "updatedAt">,
): FormDefinition {
  const now = new Date().toISOString();
  const form: FormDefinition = {
    ...def,
    id: randomUUID(),
    companyId,
    createdAt: now,
    updatedAt: now,
  };
  const defs = readDefinitions(companyId);
  defs.push(form);
  writeDefinitions(companyId, defs);
  return form;
}

export function updateForm(
  companyId: string,
  id: string,
  updates: Partial<
    Omit<FormDefinition, "id" | "companyId" | "createdAt" | "updatedAt">
  >,
): FormDefinition {
  const defs = readDefinitions(companyId);
  const idx = defs.findIndex((f) => f.id === id && f.companyId === companyId);
  if (idx === -1) throw new Error(`Form ${id} not found`);
  const updated: FormDefinition = {
    ...defs[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  defs[idx] = updated;
  writeDefinitions(companyId, defs);
  return updated;
}

export function deleteForm(companyId: string, id: string): void {
  const defs = readDefinitions(companyId);
  writeDefinitions(
    companyId,
    defs.filter((f) => !(f.id === id && f.companyId === companyId)),
  );
}

export function listForms(companyId: string): FormDefinition[] {
  return readDefinitions(companyId);
}

export function getForm(id: string): FormDefinition | null {
  // Search across all company directories
  const dataDir = path.resolve(
    resolvePaperclipInstanceRoot(),
    "data",
    "forms",
  );
  if (!fs.existsSync(dataDir)) return null;

  const companies = fs.readdirSync(dataDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const companyId of companies) {
    const defs = readDefinitions(companyId);
    const found = defs.find((f) => f.id === id);
    if (found) return found;
  }
  return null;
}

export async function submitForm(
  formId: string,
  data: Record<string, unknown>,
): Promise<FormSubmission> {
  const form = getForm(formId);
  if (!form) throw new Error(`Form ${formId} not found`);

  // Validate required fields
  for (const field of form.fields) {
    if (field.required) {
      const val = data[field.id] ?? data[field.label];
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === "string" && val.trim().length === 0);
      if (isEmpty) {
        throw new Error(`Field "${field.label}" is required`);
      }
    }
  }

  const submission: FormSubmission = {
    id: randomUUID(),
    formId,
    companyId: form.companyId,
    data,
    submittedAt: new Date().toISOString(),
    status: "pending",
  };

  // Process based on submitAction
  try {
    if (form.submitAction === "create-issue") {
      const firstTextField = form.fields.find(
        (f) => f.type === "text" || f.type === "textarea",
      );
      const title =
        firstTextField && data[firstTextField.id]
          ? String(data[firstTextField.id])
          : `Form submission: ${form.name}`;

      const descriptionParts: string[] = [];
      for (const field of form.fields) {
        const val = data[field.id] ?? data[field.label];
        if (val !== undefined && val !== null) {
          descriptionParts.push(`**${field.label}**: ${String(val)}`);
        }
      }
      const description = descriptionParts.join("\n");

      const resp = await fetch(
        `http://localhost:18800/api/companies/${form.companyId}/issues`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, description }),
        },
      );
      if (resp.ok) {
        submission.status = "processed";
      } else {
        submission.status = "error";
      }
    } else if (form.submitAction === "kb-ingest") {
      const contentParts: string[] = [`Form: ${form.name}\n`];
      for (const field of form.fields) {
        const val = data[field.id] ?? data[field.label];
        if (val !== undefined && val !== null) {
          contentParts.push(`${field.label}: ${String(val)}`);
        }
      }
      const content = contentParts.join("\n");

      const resp = await fetch(`http://localhost:18800/api/knowledge/ingest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: form.companyId,
          title: `Form: ${form.name}`,
          content,
          docType: "note",
        }),
      });
      if (resp.ok) {
        submission.status = "processed";
      } else {
        submission.status = "error";
      }
    } else if (form.submitAction === "webhook") {
      const webhookUrl = form.submitConfig.webhookUrl;
      if (!webhookUrl) {
        submission.status = "error";
      } else {
        const resp = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ formId, formName: form.name, data }),
        });
        if (resp.ok) {
          submission.status = "processed";
        } else {
          submission.status = "error";
        }
      }
    } else if (form.submitAction === "send-email") {
      // Email is handled by existing postal integration — just record it
      submission.status = "processed";
    }
  } catch {
    submission.status = "error";
  }

  const subs = readSubmissions(form.companyId);
  subs.unshift(submission);
  writeSubmissions(form.companyId, subs);

  return submission;
}

export function listSubmissions(
  companyId: string,
  formId: string,
): FormSubmission[] {
  return readSubmissions(companyId).filter((s) => s.formId === formId);
}
