import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Plus,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToastActions } from "@/context/ToastContext";
import { cn } from "@/lib/utils";
import { PageSkeleton } from "@/components/PageSkeleton";
import {
  n8nApi,
  type N8nExecutionStatus,
  type N8nExecutionSummary,
  type N8nStatusResponse,
  type N8nTemplateName,
  type N8nWorkflowSummary,
} from "@/api/n8n";

interface TemplateInfo {
  name: N8nTemplateName;
  title: string;
  description: string;
}

const TEMPLATES: TemplateInfo[] = [
  {
    name: "lead-nurture",
    title: "Lead Nurture Sequence",
    description:
      "Welcome + 3-day follow-up + 7-day offer emails sent automatically when a new lead arrives via webhook.",
  },
  {
    name: "invoice-reminder",
    title: "Invoice Overdue Reminders",
    description:
      "Daily check for overdue invoices (7 / 14 / 30 day buckets) with escalating reminder emails.",
  },
  {
    name: "review-request",
    title: "Review Request After Job",
    description:
      "After a job completes (via webhook), wait 24 hours and email the customer asking for a review.",
  },
];

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
}

function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

function ExecutionStatusBadge({ status }: { status: N8nExecutionStatus }) {
  const tone =
    status === "success"
      ? "bg-green-600 text-white"
      : status === "error" || status === "crashed"
      ? "bg-red-600 text-white"
      : status === "running"
      ? "bg-blue-600 text-white"
      : status === "waiting"
      ? "bg-amber-500 text-white"
      : "bg-muted text-muted-foreground";
  return (
    <Badge variant="outline" className={cn("border-transparent capitalize", tone)}>
      {status}
    </Badge>
  );
}

function ExecutionStatusIcon({ status }: { status: N8nExecutionStatus }) {
  if (status === "success") return <CheckCircle2 className="h-4 w-4 text-green-600" aria-hidden />;
  if (status === "error" || status === "crashed") return <XCircle className="h-4 w-4 text-red-600" aria-hidden />;
  return <RefreshCw className="h-4 w-4 text-muted-foreground" aria-hidden />;
}

function ConnectionBanner({ status }: { status: N8nStatusResponse | undefined }) {
  if (!status) {
    return (
      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground">Checking n8n connection…</CardContent>
      </Card>
    );
  }
  if (status.connected) {
    return (
      <Card>
        <CardContent className="flex items-start gap-3 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
          <div className="flex-1">
            <div className="text-sm font-medium">Connected to n8n</div>
            <div className="text-xs text-muted-foreground">
              {status.workflowCount} workflow{status.workflowCount === 1 ? "" : "s"} available at{" "}
              <span className="font-mono">{status.baseUrl}</span>.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
        <div className="flex-1">
          <div className="text-sm font-medium">n8n is not connected</div>
          <div className="mt-1 text-xs text-muted-foreground">
            n8n runs as a Docker sidecar. Start the sidecar and set{" "}
            <code className="rounded bg-muted px-1">N8N_INTERNAL_URL</code> and{" "}
            <code className="rounded bg-muted px-1">N8N_API_KEY</code> to enable automations.
          </div>
          {status.message && (
            <div className="mt-1 text-xs text-muted-foreground">Details: {status.message}</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

interface TemplatePickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (template: N8nTemplateName) => void;
  submittingTemplate: N8nTemplateName | null;
}

function TemplatePicker({ open, onClose, onSelect, submittingTemplate }: TemplatePickerProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create automation from template</DialogTitle>
          <DialogDescription>
            Deploys the template as a new n8n workflow. You can edit the workflow in the n8n UI
            afterward.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-1">
          {TEMPLATES.map((t) => (
            <Card key={t.name}>
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <div className="font-medium text-sm">{t.title}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                </div>
                <Button
                  size="sm"
                  disabled={submittingTemplate !== null}
                  onClick={() => onSelect(t.name)}
                >
                  {submittingTemplate === t.name ? "Creating..." : "Use Template"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface WorkflowRowProps {
  workflow: N8nWorkflowSummary;
  n8nBaseUrl: string;
  onToggle: (id: string) => void;
  toggling: boolean;
}

function WorkflowRow({ workflow, n8nBaseUrl, onToggle, toggling }: WorkflowRowProps) {
  const externalUrl = `${n8nBaseUrl.replace(/\/+$/, "")}/workflow/${encodeURIComponent(workflow.id)}`;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 first:border-t-0">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-sm">{workflow.name}</span>
          <Badge
            variant="outline"
            className={cn(
              "border-transparent",
              workflow.active
                ? "bg-green-600 text-white"
                : "bg-muted text-muted-foreground",
            )}
          >
            {workflow.active ? "Active" : "Inactive"}
          </Badge>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          Last run: {formatDateTime(workflow.lastExecution?.startedAt)} •{" "}
          {workflow.lastExecution?.status ? (
            <>Status: <span className="capitalize">{workflow.lastExecution.status}</span></>
          ) : (
            "No executions yet"
          )}
        </div>
      </div>
      <ToggleSwitch
        checked={workflow.active}
        onCheckedChange={() => onToggle(workflow.id)}
        disabled={toggling}
        aria-label={workflow.active ? "Deactivate workflow" : "Activate workflow"}
      />
      <Button
        size="sm"
        variant="outline"
        asChild
      >
        <a href={externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1">
          View in n8n <ExternalLink className="h-3 w-3" />
        </a>
      </Button>
    </div>
  );
}

interface ExecutionRowProps {
  workflowName: string;
  execution: N8nExecutionSummary;
}

function ExecutionRow({ workflowName, execution }: ExecutionRowProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3 text-sm first:border-t-0">
      <ExecutionStatusIcon status={execution.status} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{workflowName}</div>
        <div className="text-xs text-muted-foreground">
          {formatDateTime(execution.startedAt)} • duration {formatDuration(execution.durationMs)}
        </div>
      </div>
      <ExecutionStatusBadge status={execution.status} />
    </div>
  );
}

export function AutomationsPage() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [submittingTemplate, setSubmittingTemplate] = useState<N8nTemplateName | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: "Automations" }]);
  }, [setBreadcrumbs]);

  const statusQuery = useQuery<N8nStatusResponse>({
    queryKey: ["n8n", "status"],
    queryFn: () => n8nApi.getStatus(),
    refetchInterval: 30_000,
  });

  const workflowsQuery = useQuery<{ workflows: N8nWorkflowSummary[] }>({
    queryKey: ["n8n", "workflows"],
    queryFn: () => n8nApi.listWorkflows(),
    enabled: statusQuery.data?.connected === true,
    refetchInterval: 30_000,
  });

  const workflows = workflowsQuery.data?.workflows ?? [];

  const createFromTemplate = useMutation({
    mutationFn: (templateName: N8nTemplateName) =>
      n8nApi.createFromTemplate({ templateName, config: { activate: false } }),
    onMutate: (templateName) => {
      setSubmittingTemplate(templateName);
    },
    onSuccess: () => {
      pushToast({ title: "Workflow created from template", tone: "success" });
      setPickerOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["n8n", "workflows"] });
      void queryClient.invalidateQueries({ queryKey: ["n8n", "status"] });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to create workflow", body: err.message, tone: "error" });
    },
    onSettled: () => {
      setSubmittingTemplate(null);
    },
  });

  const toggleWorkflow = useMutation({
    mutationFn: (id: string) => n8nApi.toggleWorkflow(id),
    onMutate: (id) => {
      setTogglingId(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["n8n", "workflows"] });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to toggle workflow", body: err.message, tone: "error" });
    },
    onSettled: () => {
      setTogglingId(null);
    },
  });

  const connected = statusQuery.data?.connected === true;
  const n8nBaseUrl = statusQuery.data?.baseUrl ?? "http://n8n:5678";

  if (workflowsQuery.isLoading) return <PageSkeleton variant="list" title="Automations" />;

  if (workflowsQuery.isError) {
    return (
      <div className="p-6">
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>Failed to load automations. <button onClick={() => workflowsQuery.refetch()} className="underline">Try again</button></span>
        </div>
      </div>
    );
  }

  const recentExecutions = workflows
    .map((wf) => (wf.lastExecution ? { wf, execution: wf.lastExecution } : null))
    .filter((x): x is { wf: N8nWorkflowSummary; execution: N8nExecutionSummary } => x !== null)
    .sort((a, b) => {
      const at = a.execution.startedAt ? Date.parse(a.execution.startedAt) : 0;
      const bt = b.execution.startedAt ? Date.parse(b.execution.startedAt) : 0;
      return bt - at;
    });

  return (
    <div className="max-w-5xl space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <GitBranch className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Automations</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Visual workflow automation powered by n8n. Run on a schedule, trigger via webhook, or
            call from an agent tool.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setPickerOpen(true)}
          disabled={!connected}
        >
          <Plus className="h-4 w-4" />
          New Automation
        </Button>
      </div>

      <ConnectionBanner status={statusQuery.data} />

      {connected && (
        <>
          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Workflows</h2>
            <Card>
              <CardContent className="p-0">
                {workflowsQuery.isLoading ? (
                  <div className="p-4 text-sm text-muted-foreground">Loading workflows…</div>
                ) : workflows.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No workflows yet. Click "New Automation" to deploy a template.
                  </div>
                ) : (
                  workflows.map((wf) => (
                    <WorkflowRow
                      key={wf.id}
                      workflow={wf}
                      n8nBaseUrl={n8nBaseUrl}
                      onToggle={(id) => toggleWorkflow.mutate(id)}
                      toggling={togglingId === wf.id}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-medium text-muted-foreground">Recent Executions</h2>
            <Card>
              <CardContent className="p-0">
                {recentExecutions.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    No executions yet. Workflows need to run at least once to appear here.
                  </div>
                ) : (
                  recentExecutions.map(({ wf, execution }) => (
                    <ExecutionRow key={execution.id} workflowName={wf.name} execution={execution} />
                  ))
                )}
              </CardContent>
            </Card>
          </section>
        </>
      )}

      <TemplatePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(name) => createFromTemplate.mutate(name)}
        submittingTemplate={submittingTemplate}
      />
    </div>
  );
}
