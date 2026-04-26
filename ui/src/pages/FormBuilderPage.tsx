import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  FileInput,
  Globe,
  Loader2,
  Lock,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import {
  formsApi,
  type FieldType,
  type FormDefinition,
  type FormField,
  type FormSubmission,
  type SubmitAction,
} from "../api/forms";
import { EmptyState } from "../components/EmptyState";
import { timeAgo } from "../lib/timeAgo";
import { cn } from "../lib/utils";

const FIELD_TYPES: { value: FieldType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "textarea", label: "Textarea" },
  { value: "number", label: "Number" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "select", label: "Select (single)" },
  { value: "multiselect", label: "Select (multiple)" },
  { value: "checkbox", label: "Checkbox" },
  { value: "date", label: "Date" },
  { value: "file-upload", label: "File Upload" },
];

const SUBMIT_ACTIONS: { value: SubmitAction; label: string }[] = [
  { value: "create-issue", label: "Create Issue" },
  { value: "kb-ingest", label: "Ingest to Knowledge Base" },
  { value: "webhook", label: "Send to Webhook" },
  { value: "send-email", label: "Email Record" },
];

function randomId() {
  return Math.random().toString(36).slice(2, 9);
}

function emptyField(type: FieldType): FormField {
  return {
    id: randomId(),
    label: "",
    type,
    required: false,
    placeholder: "",
    helpText: "",
    options: type === "select" || type === "multiselect" ? [] : undefined,
  };
}

type ViewMode = "builder" | "submissions";

interface EditorState {
  name: string;
  description: string;
  fields: FormField[];
  submitAction: SubmitAction;
  submitConfig: Record<string, string>;
  isPublic: boolean;
}

function defaultEditor(): EditorState {
  return {
    name: "",
    description: "",
    fields: [],
    submitAction: "create-issue",
    submitConfig: {},
    isPublic: false,
  };
}

function formToEditor(form: FormDefinition): EditorState {
  return {
    name: form.name,
    description: form.description ?? "",
    fields: form.fields.map((f) => ({ ...f, options: f.options ? [...f.options] : undefined })),
    submitAction: form.submitAction,
    submitConfig: { ...form.submitConfig },
    isPublic: form.isPublic,
  };
}

// Preview renderer for a single field
function FieldPreview({ field }: { field: FormField }) {
  const baseInputClass =
    "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <div className="space-y-1">
      <label className="text-sm font-medium leading-none">
        {field.label || <span className="text-muted-foreground italic">Untitled field</span>}
        {field.required && <span className="text-destructive ml-1">*</span>}
      </label>
      {field.helpText && (
        <p className="text-xs text-muted-foreground">{field.helpText}</p>
      )}
      {field.type === "textarea" ? (
        <textarea
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          placeholder={field.placeholder}
          readOnly
        />
      ) : field.type === "select" || field.type === "multiselect" ? (
        <select
          className={baseInputClass}
          multiple={field.type === "multiselect"}
          disabled
        >
          {(field.options ?? []).map((opt) => (
            <option key={opt}>{opt}</option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <div className="flex items-center gap-2">
          <input type="checkbox" className="h-4 w-4 rounded border-input" disabled />
          <span className="text-sm">{field.placeholder || "Check this box"}</span>
        </div>
      ) : field.type === "date" ? (
        <input type="date" className={baseInputClass} disabled />
      ) : field.type === "file-upload" ? (
        <input type="file" className={baseInputClass} disabled />
      ) : (
        <input
          type={
            field.type === "email"
              ? "email"
              : field.type === "phone"
                ? "tel"
                : field.type === "number"
                  ? "number"
                  : "text"
          }
          className={baseInputClass}
          placeholder={field.placeholder}
          disabled
        />
      )}
    </div>
  );
}

// Card for editing one field
function FieldCard({
  field,
  index,
  onChange,
  onDelete,
}: {
  field: FormField;
  index: number;
  onChange: (updated: FormField) => void;
  onDelete: () => void;
}) {
  const hasOptions = field.type === "select" || field.type === "multiselect";

  return (
    <div className="rounded-md border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Field {index + 1} &mdash; {FIELD_TYPES.find((t) => t.value === field.type)?.label}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-muted-foreground hover:text-destructive transition-colors"
          title="Delete field"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor={`field-label-${field.id}`}>Label</Label>
          <Input
            id={`field-label-${field.id}`}
            value={field.label}
            placeholder="Field label"
            onChange={(e) => onChange({ ...field, label: e.target.value })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`field-placeholder-${field.id}`}>Placeholder</Label>
          <Input
            id={`field-placeholder-${field.id}`}
            value={field.placeholder ?? ""}
            placeholder="Placeholder text"
            onChange={(e) => onChange({ ...field, placeholder: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`field-help-${field.id}`}>Help text</Label>
        <Input
          id={`field-help-${field.id}`}
          value={field.helpText ?? ""}
          placeholder="Optional hint for users"
          onChange={(e) => onChange({ ...field, helpText: e.target.value })}
        />
      </div>

      {hasOptions && (
        <div className="space-y-1.5">
          <Label htmlFor={`field-options-${field.id}`}>Options (comma-separated)</Label>
          <Input
            id={`field-options-${field.id}`}
            value={(field.options ?? []).join(", ")}
            placeholder="Option 1, Option 2, Option 3"
            onChange={(e) =>
              onChange({
                ...field,
                options: e.target.value
                  .split(",")
                  .map((o) => o.trim())
                  .filter(Boolean),
              })
            }
          />
        </div>
      )}

      <div className="flex items-center gap-2">
        <input
          id={`field-required-${field.id}`}
          type="checkbox"
          checked={field.required}
          onChange={(e) => onChange({ ...field, required: e.target.checked })}
          className="h-4 w-4 rounded border-input"
        />
        <Label htmlFor={`field-required-${field.id}`} className="font-normal cursor-pointer">
          Required
        </Label>
      </div>
    </div>
  );
}

// Submissions table
function SubmissionsView({
  companyId,
  formId,
  formName,
}: {
  companyId: string;
  formId: string;
  formName: string;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["forms", "submissions", companyId, formId],
    queryFn: () => formsApi.listSubmissions(companyId, formId),
  });

  const submissions: FormSubmission[] = data?.submissions ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading submissions…
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="rounded-lg border border-border p-8 text-center">
        <FileInput className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">No submissions yet for "{formName}"</p>
      </div>
    );
  }

  function firstValue(sub: FormSubmission): string {
    const vals = Object.values(sub.data);
    if (vals.length === 0) return "—";
    return String(vals[0]).slice(0, 60);
  }

  return (
    <div className="border border-border divide-y divide-border overflow-hidden rounded-lg">
      {submissions.map((sub) => (
        <div key={sub.id} className="text-sm">
          <button
            type="button"
            onClick={() => setExpanded(expanded === sub.id ? null : sub.id)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-accent/40 transition-colors text-left"
          >
            <div className="min-w-0 flex-1 flex items-center gap-3">
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
                  sub.status === "processed"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : sub.status === "error"
                      ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                      : "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
                )}
              >
                {sub.status}
              </span>
              <span className="truncate text-muted-foreground">{firstValue(sub)}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-3">
              <span className="text-xs text-muted-foreground">{timeAgo(sub.submittedAt)}</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform",
                  expanded === sub.id && "rotate-180",
                )}
              />
            </div>
          </button>
          {expanded === sub.id && (
            <div className="px-4 pb-3 bg-muted/30">
              <pre className="text-xs overflow-auto rounded-md border border-border bg-background p-3 mt-2 max-h-60">
                {JSON.stringify(sub.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function FormBuilderPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [selectedFormId, setSelectedFormId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("builder");
  const [editor, setEditor] = useState<EditorState>(defaultEditor());
  const [isNew, setIsNew] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAddField, setShowAddField] = useState(false);

  useEffect(() => {
    setBreadcrumbs([{ label: "Form Builder" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading: formsLoading } = useQuery({
    queryKey: ["forms", selectedCompanyId],
    queryFn: () => formsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const forms: FormDefinition[] = data?.forms ?? [];
  const selectedForm = forms.find((f) => f.id === selectedFormId) ?? null;

  const createMutation = useMutation({
    mutationFn: (state: EditorState) =>
      formsApi.create({
        companyId: selectedCompanyId!,
        name: state.name,
        description: state.description || undefined,
        fields: state.fields,
        submitAction: state.submitAction,
        submitConfig: state.submitConfig,
        isPublic: state.isPublic,
      }),
    onSuccess: (form) => {
      void queryClient.invalidateQueries({ queryKey: ["forms", selectedCompanyId] });
      setSelectedFormId(form.id);
      setIsNew(false);
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to create form");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, state }: { id: string; state: EditorState }) =>
      formsApi.update(selectedCompanyId!, id, {
        name: state.name,
        description: state.description || undefined,
        fields: state.fields,
        submitAction: state.submitAction,
        submitConfig: state.submitConfig,
        isPublic: state.isPublic,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["forms", selectedCompanyId] });
      setError(null);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to save form");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => formsApi.delete(selectedCompanyId!, id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["forms", selectedCompanyId] });
      setSelectedFormId(null);
      setIsNew(false);
      setEditor(defaultEditor());
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Failed to delete form");
    },
  });

  function handleSelectForm(form: FormDefinition) {
    setSelectedFormId(form.id);
    setEditor(formToEditor(form));
    setIsNew(false);
    setViewMode("builder");
    setError(null);
  }

  function handleNewForm() {
    setSelectedFormId(null);
    setEditor(defaultEditor());
    setIsNew(true);
    setViewMode("builder");
    setError(null);
  }

  function handleSave() {
    if (!editor.name.trim()) {
      setError("Form name is required");
      return;
    }
    if (isNew) {
      createMutation.mutate(editor);
    } else if (selectedFormId) {
      updateMutation.mutate({ id: selectedFormId, state: editor });
    }
  }

  function handleAddField(type: FieldType) {
    setEditor((prev) => ({
      ...prev,
      fields: [...prev.fields, emptyField(type)],
    }));
    setShowAddField(false);
  }

  function handleUpdateField(index: number, updated: FormField) {
    setEditor((prev) => {
      const fields = [...prev.fields];
      fields[index] = updated;
      return { ...prev, fields };
    });
  }

  function handleDeleteField(index: number) {
    setEditor((prev) => ({
      ...prev,
      fields: prev.fields.filter((_, i) => i !== index),
    }));
  }

  const isMutating = createMutation.isPending || updateMutation.isPending;

  if (!selectedCompanyId) {
    return (
      <EmptyState
        icon={FileInput}
        message="Select a company to use the form builder."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FileInput className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Form Builder</h1>
      </div>

      {error && (
        <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-4 py-2">
          {error}
        </p>
      )}

      <div className="grid lg:grid-cols-[240px_1fr_280px] gap-4">
        {/* Left sidebar: forms list */}
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Forms
            </span>
            <Button size="sm" variant="ghost" onClick={handleNewForm}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>

          {formsLoading ? (
            <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </div>
          ) : forms.length === 0 && !isNew ? (
            <p className="text-xs text-muted-foreground py-2">
              No forms yet. Click + to create one.
            </p>
          ) : (
            <div className="space-y-0.5">
              {forms.map((form) => (
                <button
                  key={form.id}
                  type="button"
                  onClick={() => handleSelectForm(form)}
                  className={cn(
                    "w-full flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-md transition-colors text-left",
                    selectedFormId === form.id && !isNew
                      ? "bg-accent text-accent-foreground font-medium"
                      : "hover:bg-accent/50 text-foreground",
                  )}
                >
                  <span className="truncate">{form.name}</span>
                  {form.isPublic && (
                    <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                  )}
                </button>
              ))}
              {isNew && (
                <div className="px-3 py-2 text-sm rounded-md bg-accent text-accent-foreground font-medium italic">
                  New form…
                </div>
              )}
            </div>
          )}
        </div>

        {/* Center: form editor */}
        <div className="min-w-0">
          {!isNew && !selectedFormId ? (
            <div className="rounded-lg border border-border p-10 text-center h-full flex flex-col items-center justify-center gap-3">
              <FileInput className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                Select a form or create a new one.
              </p>
              <Button variant="outline" size="sm" onClick={handleNewForm}>
                <Plus className="mr-1 h-4 w-4" />
                New Form
              </Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-5 space-y-5">
              {/* View tabs (only for saved forms) */}
              {selectedFormId && !isNew && (
                <div className="flex border-b border-border gap-4 pb-0 -mt-1">
                  <button
                    type="button"
                    onClick={() => setViewMode("builder")}
                    className={cn(
                      "pb-2 text-sm font-medium border-b-2 transition-colors",
                      viewMode === "builder"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Builder
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode("submissions")}
                    className={cn(
                      "pb-2 text-sm font-medium border-b-2 transition-colors",
                      viewMode === "submissions"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Submissions
                  </button>
                </div>
              )}

              {viewMode === "submissions" && selectedFormId && selectedForm ? (
                <SubmissionsView
                  companyId={selectedCompanyId}
                  formId={selectedFormId}
                  formName={selectedForm.name}
                />
              ) : (
                <>
                  {/* Name and description */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="form-name">Form Name</Label>
                      <Input
                        id="form-name"
                        placeholder="e.g. Contact Request"
                        value={editor.name}
                        onChange={(e) =>
                          setEditor((prev) => ({ ...prev, name: e.target.value }))
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="form-description">Description (optional)</Label>
                      <Textarea
                        id="form-description"
                        placeholder="What is this form for?"
                        value={editor.description}
                        rows={2}
                        onChange={(e) =>
                          setEditor((prev) => ({ ...prev, description: e.target.value }))
                        }
                      />
                    </div>
                  </div>

                  {/* Fields */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">Fields</span>
                      <div className="relative">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setShowAddField((v) => !v)}
                        >
                          <Plus className="mr-1 h-3.5 w-3.5" />
                          Add Field
                          <ChevronDown className="ml-1 h-3.5 w-3.5" />
                        </Button>
                        {showAddField && (
                          <div className="absolute right-0 top-full mt-1 z-10 w-48 rounded-md border border-border bg-popover shadow-md">
                            {FIELD_TYPES.map((ft) => (
                              <button
                                key={ft.value}
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors first:rounded-t-md last:rounded-b-md"
                                onClick={() => handleAddField(ft.value)}
                              >
                                {ft.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {editor.fields.length === 0 ? (
                      <p className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-4 text-center">
                        No fields yet. Add a field to get started.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {editor.fields.map((field, i) => (
                          <FieldCard
                            key={field.id}
                            field={field}
                            index={i}
                            onChange={(updated) => handleUpdateField(i, updated)}
                            onDelete={() => handleDeleteField(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Submit action */}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="form-action">Submit Action</Label>
                      <select
                        id="form-action"
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={editor.submitAction}
                        onChange={(e) =>
                          setEditor((prev) => ({
                            ...prev,
                            submitAction: e.target.value as SubmitAction,
                          }))
                        }
                      >
                        {SUBMIT_ACTIONS.map((a) => (
                          <option key={a.value} value={a.value}>
                            {a.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {editor.submitAction === "webhook" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="form-webhook">Webhook URL</Label>
                        <Input
                          id="form-webhook"
                          type="url"
                          placeholder="https://hooks.example.com/..."
                          value={editor.submitConfig.webhookUrl ?? ""}
                          onChange={(e) =>
                            setEditor((prev) => ({
                              ...prev,
                              submitConfig: {
                                ...prev.submitConfig,
                                webhookUrl: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    )}

                    {editor.submitAction === "send-email" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="form-email-to">Send To (email)</Label>
                        <Input
                          id="form-email-to"
                          type="email"
                          placeholder="recipient@example.com"
                          value={editor.submitConfig.emailTo ?? ""}
                          onChange={(e) =>
                            setEditor((prev) => ({
                              ...prev,
                              submitConfig: {
                                ...prev.submitConfig,
                                emailTo: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>

                  {/* Public toggle */}
                  <div className="flex items-center gap-3 p-3 rounded-md border border-border bg-muted/30">
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {editor.isPublic ? (
                          <span className="flex items-center gap-1.5">
                            <Globe className="h-4 w-4 text-green-600" />
                            Publicly accessible
                          </span>
                        ) : (
                          <span className="flex items-center gap-1.5">
                            <Lock className="h-4 w-4 text-muted-foreground" />
                            Private (auth required)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {editor.isPublic
                          ? "Anyone with the link can submit this form."
                          : "Only authenticated users can submit."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setEditor((prev) => ({ ...prev, isPublic: !prev.isPublic }))
                      }
                      className={cn(
                        "relative inline-flex h-5 w-10 shrink-0 cursor-pointer items-center rounded-full transition-colors",
                        editor.isPublic ? "bg-green-600" : "bg-input",
                      )}
                    >
                      <span
                        className={cn(
                          "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
                          editor.isPublic ? "translate-x-5" : "translate-x-0.5",
                        )}
                      />
                    </button>
                  </div>

                  {/* Save / Delete */}
                  <div className="flex items-center gap-2 pt-1">
                    <Button onClick={handleSave} disabled={isMutating}>
                      {isMutating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Saving…
                        </>
                      ) : isNew ? (
                        "Create Form"
                      ) : (
                        "Save Changes"
                      )}
                    </Button>
                    {selectedFormId && !isNew && (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (confirm("Delete this form and all submissions?")) {
                            deleteMutation.mutate(selectedFormId);
                          }
                        }}
                      >
                        <Trash2 className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    )}
                    {selectedFormId && !isNew && (
                      <Badge variant="secondary" className="ml-auto font-mono text-xs">
                        /api/forms/public/{selectedFormId}
                      </Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Right: live preview */}
        <div className="hidden lg:block">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
            Live Preview
          </p>
          {editor.fields.length === 0 && !editor.name ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              Preview will appear here as you build your form.
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              {editor.name && (
                <div>
                  <h3 className="text-base font-semibold">{editor.name}</h3>
                  {editor.description && (
                    <p className="text-sm text-muted-foreground mt-0.5">{editor.description}</p>
                  )}
                </div>
              )}
              {editor.fields.map((field) => (
                <FieldPreview key={field.id} field={field} />
              ))}
              {editor.fields.length > 0 && (
                <button
                  type="button"
                  className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors"
                  disabled
                >
                  Submit
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
