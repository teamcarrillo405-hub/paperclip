import { useEffect, useState } from "react";
import { useNavigate } from "@/lib/router";
import { api, ApiError } from "../api/client";
import { useCompany } from "../context/CompanyContext";
import { useToastActions } from "../context/ToastContext";
import { Button } from "@/components/ui/button";

interface TemplateSummary {
  id: string;
  name: string;
  description: string;
  industry: string;
  icon: string;
  agentCount: number;
  routineCount: number;
}

interface TemplatesResponse {
  templates: TemplateSummary[];
}

interface ApplyResponse {
  templateId: string;
  company: { id: string; name: string; action: string };
  agents: Array<{ slug: string; id: string | null; action: string; name: string }>;
  projects: Array<{ slug: string; id: string | null; action: string; name: string }>;
  goals: Array<{ id: string; title: string }>;
  warnings: string[];
}

export function TemplatePicker() {
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompany();
  const { pushToast } = useToastActions();

  const [templates, setTemplates] = useState<TemplateSummary[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [applyingId, setApplyingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<TemplatesResponse>("/templates")
      .then((res) => {
        if (cancelled) return;
        setTemplates(res.templates);
      })
      .catch((err) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load templates";
        setLoadError(message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyTemplate(templateId: string) {
    if (!selectedCompanyId) {
      pushToast({
        title: "No company selected",
        body: "Select a company before applying a template.",
        tone: "error",
      });
      return;
    }
    setApplyingId(templateId);
    try {
      await api.post<ApplyResponse>(
        `/templates/${encodeURIComponent(templateId)}/apply?companyId=${encodeURIComponent(selectedCompanyId)}`,
        {},
      );
      pushToast({
        title: "Template applied",
        body: "Your AI team has been set up.",
        tone: "success",
      });
      navigate("/");
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Failed to apply template";
      pushToast({
        title: "Could not apply template",
        body: message,
        tone: "error",
      });
    } finally {
      setApplyingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Choose a starting template for your AI team
        </h1>
        <p className="mt-2 text-muted-foreground">
          Pre-built agent teams for your industry. You can customize everything after setup.
        </p>
      </div>

      {loadError ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {loadError}
        </div>
      ) : null}

      {!templates && !loadError ? (
        <div className="rounded-md border border-border bg-muted/20 p-6 text-sm text-muted-foreground">
          Loading templates…
        </div>
      ) : null}

      {templates ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {templates.map((tpl) => {
            const isApplying = applyingId === tpl.id;
            return (
              <div
                key={tpl.id}
                className="flex flex-col rounded-lg border border-border bg-card p-6 shadow-sm"
              >
                <div className="mb-3 flex items-center gap-3">
                  <div className="text-4xl leading-none">{tpl.icon}</div>
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {tpl.industry}
                  </span>
                </div>
                <div className="text-lg font-semibold">{tpl.name}</div>
                <p className="mt-1 flex-1 text-sm text-muted-foreground">{tpl.description}</p>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-secondary-foreground">
                    {tpl.agentCount} agents
                  </span>
                  <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-secondary-foreground">
                    {tpl.routineCount} routines
                  </span>
                </div>
                <div className="mt-5">
                  <Button
                    onClick={() => applyTemplate(tpl.id)}
                    disabled={isApplying || applyingId !== null}
                    className="w-full"
                  >
                    {isApplying ? "Applying…" : "Use This Template"}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mt-8 text-center">
        <button
          type="button"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => navigate("/")}
        >
          Start from scratch
        </button>
      </div>
    </div>
  );
}

export default TemplatePicker;
