import { api } from "./client";

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

export type SubmitAction = "create-issue" | "send-email" | "webhook" | "kb-ingest";

export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[];
  validation?: { min?: number; max?: number; pattern?: string };
}

export interface FormDefinition {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  fields: FormField[];
  submitAction: SubmitAction;
  submitConfig: Record<string, string>;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface FormSubmission {
  id: string;
  formId: string;
  companyId: string;
  data: Record<string, unknown>;
  submittedAt: string;
  status: "pending" | "processed" | "error";
  resultUrl?: string;
}

export type CreateFormInput = Omit<FormDefinition, "id" | "createdAt" | "updatedAt">;
export type UpdateFormInput = Partial<Omit<FormDefinition, "id" | "companyId" | "createdAt" | "updatedAt">>;

export const formsApi = {
  list(companyId: string) {
    return api.get<{ forms: FormDefinition[] }>(
      `/forms?companyId=${encodeURIComponent(companyId)}`,
    );
  },

  create(input: CreateFormInput) {
    return api.post<FormDefinition>("/forms", input);
  },

  update(companyId: string, id: string, updates: UpdateFormInput) {
    return api.put<FormDefinition>(
      `/forms/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`,
      updates,
    );
  },

  delete(companyId: string, id: string) {
    return api.delete<void>(
      `/forms/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`,
    );
  },

  listSubmissions(companyId: string, formId: string) {
    return api.get<{ submissions: FormSubmission[] }>(
      `/forms/${encodeURIComponent(formId)}/submissions?companyId=${encodeURIComponent(companyId)}`,
    );
  },

  getPublic(id: string) {
    return api.get<Pick<FormDefinition, "id" | "name" | "description" | "fields">>(
      `/forms/public/${encodeURIComponent(id)}`,
    );
  },

  submitPublic(id: string, data: Record<string, unknown>) {
    return api.post<{ submissionId: string; status: string }>(
      `/forms/public/${encodeURIComponent(id)}/submit`,
      data,
    );
  },
};
