import { cloneElement, isValidElement, useEffect, useId, useMemo, useState } from "react";
import { Link, Navigate, useLocation, useNavigate, useParams } from "@/lib/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ExecutionWorkspace, Issue, Project, ProjectWorkspace } from "@paperclipai/shared";
import { ArrowLeft, ChevronDown, ChevronRight, Copy, ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { CopyText } from "../components/CopyText";
import { ExecutionWorkspaceCloseDialog } from "../components/ExecutionWorkspaceCloseDialog";
import { agentsApi } from "../api/agents";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { heartbeatsApi } from "../api/heartbeats";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { IssuesList } from "../components/IssuesList";
import { PageTabBar } from "../components/PageTabBar";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  buildWorkspaceRuntimeControlSections,
  WorkspaceRuntimeControls,
  type WorkspaceRuntimeControlRequest,
} from "../components/WorkspaceRuntimeControls";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { queryKeys } from "../lib/queryKeys";
import { cn, formatDateTime, issueUrl, projectRouteRef, projectWorkspaceUrl } from "../lib/utils";

type WorkspaceFormState = {
  name: string;
  cwd: string;
  repoUrl: string;
  baseRef: string;
  branchName: string;
  providerRef: string;
  provisionCommand: string;
  teardownCommand: string;
  cleanupCommand: string;
  inheritRuntime: boolean;
  workspaceRuntime: string;
};

type ExecutionWorkspaceTab = "configuration" | "runtime_logs" | "issues";

function resolveExecutionWorkspaceTab(pathname: string, workspaceId: string): ExecutionWorkspaceTab | null {
  const segments = pathname.split("/").filter(Boolean);
  const executionWorkspacesIndex = segments.indexOf("execution-workspaces");
  if (executionWorkspacesIndex === -1 || segments[executionWorkspacesIndex + 1] !== workspaceId) return null;
  const tab = segments[executionWorkspacesIndex + 2];
  if (tab === "issues") return "issues";
  if (tab === "runtime-logs") return "runtime_logs";
  if (tab === "configuration") return "configuration";
  return null;
}

function executionWorkspaceTabPath(workspaceId: string, tab: ExecutionWorkspaceTab) {
  const segment = tab === "runtime_logs" ? "runtime-logs" : tab;
  return `/execution-workspaces/${workspaceId}/${segment}`;
}

function isSafeExternalUrl(value: string | null | undefined) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function readText(value: string | null | undefined) {
  return value ?? "";
}

function formatJson(value: Record<string, unknown> | null | undefined) {
  if (!value || Object.keys(value).length === 0) return "";
  return JSON.stringify(value, null, 2);
}

function normalizeText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function parseWorkspaceRuntimeJson(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true as const, value: null as Record<string, unknown> | null };

  try {
    const parsed = JSON.parse(trimmed);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {
        ok: false as const,
        error: "Workspace commands JSON must be a JSON object.",
      };
    }
    return { ok: true as const, value: parsed as Record<string, unknown> };
  } catch (error) {
    return {
      ok: false as const,
      error: error instanceof Error ? error.message : "Invalid JSON.",
    };
  }
}

function formStateFromWorkspace(workspace: ExecutionWorkspace): WorkspaceFormState {
  return {
    name: workspace.name,
    cwd: readText(workspace.cwd),
    repoUrl: readText(workspace.repoUrl),
    baseRef: readText(workspace.baseRef),
    branchName: readText(workspace.branchName),
    providerRef: readText(workspace.providerRef),
    provisionCommand: readText(workspace.config?.provisionCommand),
    teardownCommand: readText(workspace.config?.teardownCommand),
    cleanupCommand: readText(workspace.config?.cleanupCommand),
    inheritRuntime: !workspace.config?.workspaceRuntime,
    workspaceRuntime: formatJson(workspace.config?.workspaceRuntime),
  };
}

function buildWorkspacePatch(initialState: WorkspaceFormState, nextState: WorkspaceFormState) {
  const patch: Record<string, unknown> = {};
  const configPatch: Record<string, unknown> = {};

  const maybeAssign = (
    key: keyof Pick<WorkspaceFormState, "name" | "cwd" | "repoUrl" | "baseRef" | "branchName" | "providerRef">,
  ) => {
    if (initialState[key] === nextState[key]) return;
    patch[key] = key === "name" ? (normalizeText(nextState[key]) ?? initialState.name) : normalizeText(nextState[key]);
  };

  maybeAssign("name");
  maybeAssign("cwd");
  maybeAssign("repoUrl");
  maybeAssign("baseRef");
  maybeAssign("branchName");
  maybeAssign("providerRef");

  const maybeAssignConfigText = (key: keyof Pick<WorkspaceFormState, "provisionCommand" | "teardownCommand" | "cleanupCommand">) => {
    if (initialState[key] === nextState[key]) return;
    configPatch[key] = normalizeText(nextState[key]);
  };

  maybeAssignConfigText("provisionCommand");
  maybeAssignConfigText("teardownCommand");
  maybeAssignConfigText("cleanupCommand");

  if (initialState.inheritRuntime !== nextState.inheritRuntime || initialState.workspaceRuntime !== nextState.workspaceRuntime) {
    const parsed = parseWorkspaceRuntimeJson(nextState.workspaceRuntime);
    if (!parsed.ok) throw new Error(parsed.error);
    configPatch.workspaceRuntime = nextState.inheritRuntime ? null : parsed.value;
  }

  if (Object.keys(configPatch).length > 0) {
    patch.config = configPatch;
  }

  return patch;
}

function validateForm(form: WorkspaceFormState) {
  const repoUrl = normalizeText(form.repoUrl);
  if (repoUrl) {
    try {
      new URL(repoUrl);
    } catch {
      return "Repo URL must be a valid URL.";
    }
  }

  if (!form.inheritRuntime) {
    const runtimeJson = parseWorkspaceRuntimeJson(form.workspaceRuntime);
    if (!runtimeJson.ok) {
      return runtimeJson.error;
    }
  }

  return null;
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const child = isValidElement(children) ? cloneElement(children as React.ReactElement<{ id?: string }>, { id: generatedId }) : children;
  return (
    <div className="block space-y-2">
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
        <label htmlFor={generatedId} className="text-sm font-medium text-foreground">{label}</label>
        {hint ? <span className="text-xs text-muted-foreground sm:text-right">{hint}</span> : null}
      </div>
      {child}
    </div>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <dl className="flex flex-col gap-1.5 py-1.5 sm:flex-row sm:items-start sm:gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground sm:w-32">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </dl>
  );
}

function StatusPill({ children, className, "aria-hidden": ariaHidden }: { children: React.ReactNode; className?: string; "aria-hidden"?: boolean | "true" | "false" }) {
  return (
    <div aria-hidden={ariaHidden} className={cn("inline-flex items-center rounded-full border border-border bg-background px-2.5 py-1 text-xs text-muted-foreground", className)}>
      {children}
    </div>
  );
}

function MonoValue({ value, copy }: { value: string; copy?: boolean }) {
  return (
    <div className="inline-flex max-w-full items-start gap-2">
      <span className="break-all font-mono text-xs">{value}</span>
      {copy ? (
        <CopyText text={value} className="shrink-0 text-muted-foreground hover:text-foreground" copiedLabel="Copied" ariaLabel="Copy to clipboard">
          <Copy aria-hidden="true" className="h-3.5 w-3.5" />
        </CopyText>
      ) : null}
    </div>
  );
}

function WorkspaceLink({
  project,
  workspace,
}: {
  project: Project;
  workspace: ProjectWorkspace;
}) {
  return <Link to={projectWorkspaceUrl(project, workspace.id)} className="hover:underline">{workspace.name}</Link>;
}

function ExecutionWorkspaceIssuesList({
  companyId,
  workspaceId,
  issues,
  isLoading,
  error,
  project,
}: {
  companyId: string;
  workspaceId: string;
  issues: Issue[];
  isLoading: boolean;
  error: Error | null;
  project: Project | null;
}) {
  const queryClient = useQueryClient();

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: liveRuns } = useQuery({
    queryKey: queryKeys.liveRuns(companyId),
    queryFn: () => heartbeatsApi.liveRunsForCompany(companyId),
    enabled: !!companyId,
    refetchInterval: 5000,
  });

  const liveIssueIds = useMemo(() => {
    const ids = new Set<string>();
    for (const run of liveRuns ?? []) {
      if (run.issueId) ids.add(run.issueId);
    }
    return ids;
  }, [liveRuns]);

  const updateIssue = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => issuesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByExecutionWorkspace(companyId, workspaceId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
      if (project?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.listByProject(companyId, project.id) });
      }
    },
  });

  const projectOptions = useMemo(
    () => (project ? [{ id: project.id, name: project.name, workspaces: project.workspaces ?? [] }] : undefined),
    [project],
  );

  return (
    <IssuesList
      issues={issues}
      isLoading={isLoading}
      error={error}
      agents={agents}
      projects={projectOptions}
      liveIssueIds={liveIssueIds}
      projectId={project?.id}
      viewStateKey="paperclip:execution-workspace-issues-view"
      onUpdateIssue={(id, data) => updateIssue.mutate({ id, data })}
    />
  );
}

export function ExecutionWorkspaceDetail() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const [form, setForm] = useState<WorkspaceFormState | null>(null);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [runtimeActionErrorMessage, setRuntimeActionErrorMessage] = useState<string | null>(null);
  const [runtimeActionMessage, setRuntimeActionMessage] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState<{ nextTab: ExecutionWorkspaceTab } | null>(null);
  const [hasSaved, setHasSaved] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const activeTab = workspaceId ? resolveExecutionWorkspaceTab(location.pathname, workspaceId) : null;

  const workspaceQuery = useQuery({
    queryKey: queryKeys.executionWorkspaces.detail(workspaceId!),
    queryFn: () => executionWorkspacesApi.get(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const workspace = workspaceQuery.data ?? null;

  const projectQuery = useQuery({
    queryKey: workspace ? [...queryKeys.projects.detail(workspace.projectId), workspace.companyId] : ["projects", "detail", "__pending__"],
    queryFn: () => projectsApi.get(workspace!.projectId, workspace!.companyId),
    enabled: Boolean(workspace?.projectId),
  });
  const project = projectQuery.data ?? null;

  const sourceIssueQuery = useQuery({
    queryKey: workspace?.sourceIssueId ? queryKeys.issues.detail(workspace.sourceIssueId) : ["issues", "detail", "__none__"],
    queryFn: () => issuesApi.get(workspace!.sourceIssueId!),
    enabled: Boolean(workspace?.sourceIssueId),
  });
  const sourceIssue = sourceIssueQuery.data ?? null;

  const derivedWorkspaceQuery = useQuery({
    queryKey: workspace?.derivedFromExecutionWorkspaceId
      ? queryKeys.executionWorkspaces.detail(workspace.derivedFromExecutionWorkspaceId)
      : ["execution-workspaces", "detail", "__none__"],
    queryFn: () => executionWorkspacesApi.get(workspace!.derivedFromExecutionWorkspaceId!),
    enabled: Boolean(workspace?.derivedFromExecutionWorkspaceId),
  });
  const derivedWorkspace = derivedWorkspaceQuery.data ?? null;
  const linkedIssuesQuery = useQuery({
    queryKey: workspace
      ? queryKeys.issues.listByExecutionWorkspace(workspace.companyId, workspace.id)
      : ["issues", "__execution-workspace__", "__none__"],
    queryFn: () => issuesApi.list(workspace!.companyId, { executionWorkspaceId: workspace!.id }),
    enabled: Boolean(workspace?.companyId),
  });
  const linkedIssues = linkedIssuesQuery.data ?? [];

  const linkedProjectWorkspace = useMemo(
    () => project?.workspaces.find((item) => item.id === workspace?.projectWorkspaceId) ?? null,
    [project, workspace?.projectWorkspaceId],
  );
  const inheritedRuntimeConfig = linkedProjectWorkspace?.runtimeConfig?.workspaceRuntime ?? null;
  const effectiveRuntimeConfig = workspace?.config?.workspaceRuntime ?? inheritedRuntimeConfig;
  const runtimeConfigSource =
    workspace?.config?.workspaceRuntime
      ? "execution_workspace"
      : inheritedRuntimeConfig
        ? "project_workspace"
        : "none";

  const initialState = useMemo(() => (workspace ? formStateFromWorkspace(workspace) : null), [workspace]);
  const isDirty = Boolean(form && initialState && JSON.stringify(form) !== JSON.stringify(initialState));
  const projectRef = project ? projectRouteRef(project) : workspace?.projectId ?? "";

  useEffect(() => {
    if (!workspace?.companyId || workspace.companyId === selectedCompanyId) return;
    setSelectedCompanyId(workspace.companyId, { source: "route_sync" });
  }, [workspace?.companyId, selectedCompanyId, setSelectedCompanyId]);

  useEffect(() => {
    if (!workspace) return;
    setForm(formStateFromWorkspace(workspace));
    setErrorMessage(null);
    setRuntimeActionErrorMessage(null);
  }, [workspace]);

  useEffect(() => {
    if (!workspace) return;
    const crumbs = [
      { label: "Projects", href: "/projects" },
      ...(project ? [{ label: project.name, href: `/projects/${projectRef}` }] : []),
      ...(project ? [{ label: "Workspaces", href: `/projects/${projectRef}/workspaces` }] : []),
      { label: workspace.name },
    ];
    setBreadcrumbs(crumbs);
  }, [setBreadcrumbs, workspace, project, projectRef]);

  const updateWorkspace = useMutation({
    mutationFn: (patch: Record<string, unknown>) => executionWorkspacesApi.update(workspace!.id, patch),
    onSuccess: (nextWorkspace) => {
      queryClient.setQueryData(queryKeys.executionWorkspaces.detail(nextWorkspace.id), nextWorkspace);
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.closeReadiness(nextWorkspace.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.workspaceOperations(nextWorkspace.id) });
      if (project) {
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.urlKey) });
      }
      if (sourceIssue) {
        queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(sourceIssue.id) });
      }
      setErrorMessage(null);
      setHasSaved(true);
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save execution workspace.");
    },
  });
  const workspaceOperationsQuery = useQuery({
    queryKey: queryKeys.executionWorkspaces.workspaceOperations(workspaceId!),
    queryFn: () => executionWorkspacesApi.listWorkspaceOperations(workspaceId!),
    enabled: Boolean(workspaceId),
  });
  const controlRuntimeServices = useMutation({
    mutationFn: (request: WorkspaceRuntimeControlRequest) =>
      executionWorkspacesApi.controlRuntimeCommands(workspace!.id, request.action, request),
    onSuccess: (result, request) => {
      queryClient.setQueryData(queryKeys.executionWorkspaces.detail(result.workspace.id), result.workspace);
      queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.workspaceOperations(result.workspace.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(result.workspace.projectId) });
      setRuntimeActionErrorMessage(null);
      setRuntimeActionMessage(
        request.action === "run"
          ? "Workspace job completed."
          : request.action === "stop"
            ? "Workspace service stopped."
            : request.action === "restart"
              ? "Workspace service restarted."
              : "Workspace service started.",
      );
    },
    onError: (error) => {
      setRuntimeActionMessage(null);
      setRuntimeActionErrorMessage(error instanceof Error ? error.message : "Failed to control workspace commands.");
    },
  });

  if (workspaceQuery.isLoading) return <PageSkeleton variant="detail" />;
  if (workspaceQuery.error) {
    return (
      <div className="flex items-center gap-3">
        <p role="alert" className="text-sm text-destructive">
          {workspaceQuery.error instanceof Error ? workspaceQuery.error.message : "Failed to load workspace"}
        </p>
        <Button size="sm" variant="ghost" onClick={() => void workspaceQuery.refetch()} disabled={workspaceQuery.isRefetching}>
          {workspaceQuery.isRefetching ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }
  if (!workspace || !form || !initialState) return <PageSkeleton variant="detail" />;

  const canRunWorkspaceCommands = Boolean(workspace.cwd);
  const canStartRuntimeServices = Boolean(effectiveRuntimeConfig) && canRunWorkspaceCommands;
  const runtimeControlSections = buildWorkspaceRuntimeControlSections({
    runtimeConfig: effectiveRuntimeConfig,
    runtimeServices: workspace.runtimeServices ?? [],
    canStartServices: canStartRuntimeServices,
    canRunJobs: canRunWorkspaceCommands,
  });
  const pendingRuntimeAction = controlRuntimeServices.isPending ? controlRuntimeServices.variables ?? null : null;

  if (workspaceId && activeTab === null) {
    let cachedTab: ExecutionWorkspaceTab = "configuration";
    try {
      const storedTab = localStorage.getItem(`paperclip:execution-workspace-tab:${workspaceId}`);
      if (storedTab === "issues" || storedTab === "configuration" || storedTab === "runtime_logs") {
        cachedTab = storedTab;
      }
    } catch {}
    return <Navigate to={executionWorkspaceTabPath(workspaceId, cachedTab)} replace />;
  }

  const handleTabChange = (tab: ExecutionWorkspaceTab, force?: boolean) => {
    if (isDirty && !force) {
      setShowLeaveConfirm({ nextTab: tab });
      return;
    }
    try {
      localStorage.setItem(`paperclip:execution-workspace-tab:${workspace.id}`, tab);
    } catch {}
    navigate(executionWorkspaceTabPath(workspace.id, tab));
  };

  const saveChanges = () => {
    const validationError = validateForm(form);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    let patch: Record<string, unknown>;
    try {
      patch = buildWorkspacePatch(initialState, form);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to build workspace update.");
      return;
    }

    if (Object.keys(patch).length === 0) return;
    updateWorkspace.mutate(patch);
  };

  return (
    <>
      <div className="space-y-4 overflow-hidden sm:space-y-6">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to={project ? `/projects/${projectRef}/workspaces` : "/projects"}>
              <ArrowLeft aria-hidden="true" className="mr-1 h-4 w-4" />
              Back to all workspaces
            </Link>
          </Button>
          <span aria-label={`Mode: ${workspace.mode}`}>
            <StatusPill aria-hidden="true">{workspace.mode}</StatusPill>
          </span>
          <span aria-label={`Provider: ${workspace.providerType}`}>
            <StatusPill aria-hidden="true">{workspace.providerType}</StatusPill>
          </span>
          <span aria-label={`Workspace status: ${workspace.status}`}>
            <StatusPill className={workspace.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : undefined} aria-hidden="true">
              {workspace.status === "active" ? <span aria-hidden="true">{"● "}</span> : <span aria-hidden="true">{"○ "}</span>}{workspace.status}
            </StatusPill>
          </span>
        </div>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
            Execution workspace
          </div>
          <h1 className="truncate text-xl font-semibold sm:text-2xl">{workspace.name}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Configure the concrete runtime workspace that Paperclip reuses for this issue flow.
            <span className="hidden sm:inline"> These settings stay attached to the execution workspace so future runs can keep local paths, repo refs, provisioning, teardown, and runtime-service behavior in sync with the actual workspace being reused.</span>
          </p>
        </div>

        <Tabs value={activeTab ?? "configuration"} onValueChange={(value) => handleTabChange(value as ExecutionWorkspaceTab)}>
          <PageTabBar
            items={[
              { value: "configuration", label: "Configuration" },
              { value: "runtime_logs", label: "Runtime logs" },
              { value: "issues", label: "Issues" },
            ]}
            align="start"
            value={activeTab ?? "configuration"}
            onValueChange={(value) => handleTabChange(value as ExecutionWorkspaceTab)}
          />

          <TabsContent value="configuration">
            <div className="space-y-4 sm:space-y-6">
              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle><h2 className="text-base font-semibold leading-none">Services and jobs</h2></CardTitle>
                  <CardDescription>
                    Source: {runtimeConfigSource === "execution_workspace"
                      ? "execution workspace override"
                      : runtimeConfigSource === "project_workspace"
                        ? "project workspace default"
                        : "none"}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                <WorkspaceRuntimeControls
                  sections={runtimeControlSections}
                  isPending={controlRuntimeServices.isPending}
                  pendingRequest={pendingRuntimeAction}
                  serviceEmptyMessage={
                    effectiveRuntimeConfig
                      ? "No services have been started for this execution workspace yet."
                      : "No workspace command config is defined for this execution workspace yet."
                  }
                  jobEmptyMessage="No one-shot jobs are configured for this execution workspace yet."
                  disabledHint={
                    canStartRuntimeServices
                      ? null
                      : "Execution workspaces need a working directory before local commands can run, and services also need runtime config."
                  }
                  onAction={(request) => controlRuntimeServices.mutate(request)}
                />
                <p role="status" aria-live="polite" className="sr-only">{runtimeActionMessage ?? ""}</p>
                <p role="alert" aria-live="assertive" className={runtimeActionErrorMessage ? "mt-4 text-sm text-destructive" : "sr-only"}>{runtimeActionErrorMessage ?? ""}</p>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle><h2 className="text-base font-semibold leading-none">Workspace settings</h2></CardTitle>
                  <CardDescription>
                    Edit the concrete path, repo, branch, provisioning, teardown, and runtime overrides attached to this execution workspace.
                  </CardDescription>
                  <CardAction>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="w-full rounded-none sm:w-auto"
                      onClick={() => setCloseDialogOpen(true)}
                      disabled={workspace.status === "archived"}
                    >
                      {workspace.status === "cleanup_failed" ? "Retry close" : "Close workspace"}
                    </Button>
                  </CardAction>
                </CardHeader>

                <CardContent>

                <div className="space-y-6">
                  <div className="space-y-4">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">General</h3>
                    <Field label="Workspace name">
                      <Input
                        value={form.name}
                        onChange={(event) => setForm((current) => current ? { ...current, name: event.target.value } : current)}
                        placeholder="Execution workspace name"
                      />
                    </Field>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Source control</h3>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Branch name" hint="Useful for isolated worktrees">
                        <Input
                          className="font-mono"
                          value={form.branchName}
                          onChange={(event) => setForm((current) => current ? { ...current, branchName: event.target.value } : current)}
                          placeholder="PAP-946-workspace"
                        />
                      </Field>

                      <Field label="Base ref">
                        <Input
                          className="font-mono"
                          value={form.baseRef}
                          onChange={(event) => setForm((current) => current ? { ...current, baseRef: event.target.value } : current)}
                          placeholder="origin/main"
                        />
                      </Field>
                    </div>

                    <Field label="Repo URL">
                      <Input
                        value={form.repoUrl}
                        onChange={(event) => setForm((current) => current ? { ...current, repoUrl: event.target.value } : current)}
                        placeholder="https://github.com/org/repo"
                      />
                    </Field>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Paths</h3>
                    <Field label="Working directory">
                      <Input
                        className="font-mono"
                        value={form.cwd}
                        onChange={(event) => setForm((current) => current ? { ...current, cwd: event.target.value } : current)}
                        placeholder="/absolute/path/to/workspace"
                      />
                    </Field>

                    <Field label="Provider path / ref">
                      <Input
                        className="font-mono"
                        value={form.providerRef}
                        onChange={(event) => setForm((current) => current ? { ...current, providerRef: event.target.value } : current)}
                        placeholder="/path/to/worktree or provider ref"
                      />
                    </Field>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Lifecycle commands</h3>
                    <Field label="Provision command" hint="Runs when Paperclip prepares this execution workspace">
                      <Textarea
                        className="min-h-20 font-mono"
                        value={form.provisionCommand}
                        onChange={(event) => setForm((current) => current ? { ...current, provisionCommand: event.target.value } : current)}
                        placeholder="bash ./scripts/provision-worktree.sh"
                      />
                    </Field>

                    <Field label="Teardown command" hint="Runs when the execution workspace is archived or cleaned up">
                      <Textarea
                        className="min-h-20 font-mono"
                        value={form.teardownCommand}
                        onChange={(event) => setForm((current) => current ? { ...current, teardownCommand: event.target.value } : current)}
                        placeholder="bash ./scripts/teardown-worktree.sh"
                      />
                    </Field>

                    <Field label="Cleanup command" hint="Workspace-specific cleanup before teardown">
                      <Textarea
                        className="min-h-16 font-mono"
                        value={form.cleanupCommand}
                        onChange={(event) => setForm((current) => current ? { ...current, cleanupCommand: event.target.value } : current)}
                        placeholder="pkill -f vite || true"
                      />
                    </Field>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <h3 className="text-xs font-medium uppercase tracking-widest text-muted-foreground">Runtime config</h3>
                    <div className="rounded-md border border-dashed border-border/70 bg-background px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                        <div className="space-y-1">
                          <div className="text-sm font-medium text-foreground">
                            Runtime config source
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {runtimeConfigSource === "execution_workspace"
                              ? "This execution workspace currently overrides the project workspace runtime config."
                              : runtimeConfigSource === "project_workspace"
                                ? "This execution workspace is inheriting the project workspace runtime config."
                                : "No runtime config is currently defined on this execution workspace or its project workspace."}
                          </p>
                        </div>
                        <span
                          id="reset-to-inherit-hint"
                          className="sr-only"
                        >
                          Reset to inherit is unavailable because no project workspace runtime configuration exists.
                        </span>
                        <Button
                          variant="outline"
                          className="w-full sm:w-auto"
                          size="sm"
                          disabled={!linkedProjectWorkspace?.runtimeConfig?.workspaceRuntime}
                          title={!linkedProjectWorkspace?.runtimeConfig?.workspaceRuntime ? "Reset to inherit is unavailable because no project workspace runtime configuration exists." : undefined}
                          aria-describedby={!linkedProjectWorkspace?.runtimeConfig?.workspaceRuntime ? "reset-to-inherit-hint" : undefined}
                          onClick={() =>
                            setForm((current) => current ? {
                              ...current,
                              inheritRuntime: true,
                              workspaceRuntime: "",
                            } : current)
                          }
                        >
                          Reset to inherit
                        </Button>
                      </div>
                    </div>

                    <Collapsible
                      open={advancedOpen}
                      onOpenChange={(open) => {
                        setAdvancedOpen(open);
                        if (!open) setJsonError(null);
                      }}
                      className="rounded-md border border-dashed border-border/70 bg-background px-4 py-3"
                    >
                      <CollapsibleTrigger className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        {advancedOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                        Advanced runtime JSON
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <p className="mt-2 text-sm text-muted-foreground">
                          Override the inherited workspace command model only when this execution workspace truly needs different service or job behavior.
                        </p>
                        <div className="mt-3">
                          <div className="space-y-2">
                            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
                              <p className="text-xs text-muted-foreground">Advanced runtime JSON</p>
                              <span className="text-xs text-muted-foreground sm:text-right">Legacy `services` arrays still work, but `commands` supports both services and jobs.</span>
                            </div>
                            <div className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
                              <Checkbox
                                id="inherit-runtime-config"
                                checked={form.inheritRuntime}
                                onCheckedChange={(checked) => {
                                  const isChecked = checked === true;
                                  setForm((current) => {
                                    if (!current) return current;
                                    if (!isChecked && !current.workspaceRuntime.trim() && inheritedRuntimeConfig) {
                                      return { ...current, inheritRuntime: isChecked, workspaceRuntime: formatJson(inheritedRuntimeConfig) };
                                    }
                                    return { ...current, inheritRuntime: isChecked };
                                  });
                                }}
                              />
                              <label htmlFor="inherit-runtime-config">Inherit project workspace runtime config</label>
                            </div>
                            <label htmlFor="runtime-json-editor" className="sr-only">Advanced runtime JSON</label>
                            <Textarea
                              id="runtime-json-editor"
                              className="min-h-64 font-mono sm:min-h-96"
                              value={form.workspaceRuntime}
                              onChange={(event) => {
                                const value = event.target.value;
                                setForm((current) => current ? { ...current, workspaceRuntime: value } : current);
                                if (!value.trim()) {
                                  setJsonError(null);
                                } else {
                                  try {
                                    JSON.parse(value);
                                    setJsonError(null);
                                  } catch {
                                    setJsonError("Invalid JSON");
                                  }
                                }
                              }}
                              disabled={form.inheritRuntime}
                              placeholder={'{\n  "commands": [\n    {\n      "id": "web",\n      "name": "web",\n      "kind": "service",\n      "command": "pnpm dev",\n      "cwd": ".",\n      "port": { "type": "auto" }\n    },\n    {\n      "id": "db-migrate",\n      "name": "db:migrate",\n      "kind": "job",\n      "command": "pnpm db:migrate",\n      "cwd": "."\n    }\n  ]\n}'}
                            />
                            {jsonError ? <p role="alert" className="text-xs text-destructive mt-1">{jsonError}</p> : null}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Button type="button" className="w-full sm:w-auto" disabled={!isDirty || updateWorkspace.isPending} onClick={saveChanges}>
                      {updateWorkspace.isPending ? (
                        <><Loader2 aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />Saving...</>
                      ) : (
                        "Save changes"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full sm:w-auto"
                      disabled={!isDirty || updateWorkspace.isPending}
                      onClick={() => {
                        setForm(initialState);
                        setErrorMessage(null);
                        setRuntimeActionErrorMessage(null);
                        setRuntimeActionMessage(null);
                      }}
                    >
                      Reset
                    </Button>
                    {!errorMessage && hasSaved && !isDirty ? <p className="text-sm text-muted-foreground">No unsaved changes.</p> : null}
                  </div>
                  {errorMessage && (
                    <p role="alert" className="mt-1 text-sm text-destructive">{errorMessage}</p>
                  )}
                </div>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle><h2 className="text-base font-semibold leading-none">Workspace context</h2></CardTitle>
                  <CardDescription>Linked objects and relationships</CardDescription>
                </CardHeader>
                <CardContent>
                <DetailRow label="Project">
                  {projectQuery.error ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-destructive">Failed to load</span>
                      <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs text-destructive/70 hover:text-destructive" onClick={() => void projectQuery.refetch()}>Retry</Button>
                    </span>
                  ) : project ? (
                    <Link to={`/projects/${projectRef}`} className="hover:underline">{project.name}</Link>
                  ) : (
                    <MonoValue value={workspace.projectId} />
                  )}
                </DetailRow>
                <DetailRow label="Project workspace">
                  {project && linkedProjectWorkspace ? (
                    <WorkspaceLink project={project} workspace={linkedProjectWorkspace} />
                  ) : workspace.projectWorkspaceId ? (
                    <MonoValue value={workspace.projectWorkspaceId} />
                  ) : (
                    "None"
                  )}
                </DetailRow>
                <DetailRow label="Source issue">
                  {sourceIssueQuery.error ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-destructive">Failed to load</span>
                      <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs text-destructive/70 hover:text-destructive" onClick={() => void sourceIssueQuery.refetch()}>Retry</Button>
                    </span>
                  ) : sourceIssue ? (
                    <Link to={issueUrl(sourceIssue)} className="hover:underline">
                      {sourceIssue.identifier ?? sourceIssue.id} · {sourceIssue.title}
                    </Link>
                  ) : workspace.sourceIssueId ? (
                    <MonoValue value={workspace.sourceIssueId} />
                  ) : (
                    "None"
                  )}
                </DetailRow>
                <DetailRow label="Derived from">
                  {derivedWorkspaceQuery.error ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="text-xs text-destructive">Failed to load</span>
                      <Button size="sm" variant="ghost" className="h-auto px-1 py-0 text-xs text-destructive/70 hover:text-destructive" onClick={() => void derivedWorkspaceQuery.refetch()}>Retry</Button>
                    </span>
                  ) : derivedWorkspace ? (
                    <Link to={executionWorkspaceTabPath(derivedWorkspace.id, "configuration")} className="hover:underline">
                      {derivedWorkspace.name}
                    </Link>
                  ) : workspace.derivedFromExecutionWorkspaceId ? (
                    <MonoValue value={workspace.derivedFromExecutionWorkspaceId} />
                  ) : (
                    "None"
                  )}
                </DetailRow>
                <DetailRow label="Workspace ID">
                  <MonoValue value={workspace.id} />
                </DetailRow>
                </CardContent>
              </Card>

              <Card className="rounded-lg">
                <CardHeader>
                  <CardTitle><h2 className="text-base font-semibold leading-none">Concrete location</h2></CardTitle>
                  <CardDescription>Paths and refs</CardDescription>
                </CardHeader>
                <CardContent>
                <DetailRow label="Working dir">
                  {workspace.cwd ? <MonoValue value={workspace.cwd} copy /> : "None"}
                </DetailRow>
                <DetailRow label="Provider ref">
                  {workspace.providerRef ? <MonoValue value={workspace.providerRef} copy /> : "None"}
                </DetailRow>
                <DetailRow label="Repo URL">
                  {workspace.repoUrl && isSafeExternalUrl(workspace.repoUrl) ? (
                    <div className="inline-flex max-w-full items-start gap-2">
                      <a href={workspace.repoUrl} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 break-all hover:underline">
                        {workspace.repoUrl}
                        <ExternalLink aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                      </a>
                      <CopyText text={workspace.repoUrl} className="shrink-0 text-muted-foreground hover:text-foreground" copiedLabel="Copied" ariaLabel="Copy to clipboard">
                        <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                      </CopyText>
                    </div>
                  ) : workspace.repoUrl ? (
                    <MonoValue value={workspace.repoUrl} copy />
                  ) : (
                    "None"
                  )}
                </DetailRow>
                <DetailRow label="Base ref">
                  {workspace.baseRef ? <MonoValue value={workspace.baseRef} copy /> : "None"}
                </DetailRow>
                <DetailRow label="Branch">
                  {workspace.branchName ? <MonoValue value={workspace.branchName} copy /> : "None"}
                </DetailRow>
                <DetailRow label="Opened">{formatDateTime(workspace.openedAt)}</DetailRow>
                <DetailRow label="Last used">{formatDateTime(workspace.lastUsedAt)}</DetailRow>
                <DetailRow label="Cleanup">
                  {workspace.cleanupEligibleAt
                    ? `${formatDateTime(workspace.cleanupEligibleAt)}${workspace.cleanupReason ? ` · ${workspace.cleanupReason}` : ""}`
                    : "Not scheduled"}
                </DetailRow>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="runtime_logs">
            <Card className="rounded-lg">
              <CardHeader>
                <CardTitle><h2 className="text-base font-semibold leading-none">Runtime and cleanup logs</h2></CardTitle>
                <CardDescription>Recent operations</CardDescription>
              </CardHeader>
              <CardContent>
              {workspaceOperationsQuery.isLoading ? (
                <div className="space-y-2 py-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="h-12 rounded-md bg-muted animate-pulse" />
                  ))}
                </div>
              ) : workspaceOperationsQuery.error ? (
                <p role="alert" className="text-sm text-destructive">
                  {workspaceOperationsQuery.error instanceof Error
                    ? workspaceOperationsQuery.error.message
                    : "Failed to load workspace operations."}
                </p>
              ) : workspaceOperationsQuery.data && workspaceOperationsQuery.data.length > 0 ? (
                <div className="space-y-3">
                  {workspaceOperationsQuery.data.map((operation) => (
                    <div key={operation.id} className="rounded-none border border-border/80 bg-background px-4 py-3">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="space-y-1">
                          <div className="text-sm font-medium">{operation.command ?? operation.phase}</div>
                          <div className="text-xs text-muted-foreground">
                            {formatDateTime(operation.startedAt)}
                            {operation.finishedAt ? ` → ${formatDateTime(operation.finishedAt)}` : ""}
                          </div>
                          {operation.stderrExcerpt ? (
                            <div className="whitespace-pre-wrap break-words text-xs text-destructive">{operation.stderrExcerpt}</div>
                          ) : operation.stdoutExcerpt ? (
                            <div className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{operation.stdoutExcerpt}</div>
                          ) : null}
                        </div>
                        <StatusPill className="self-start">{operation.status}</StatusPill>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No workspace operations have been recorded yet.</p>
              )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues">
            <ExecutionWorkspaceIssuesList
              companyId={workspace.companyId}
              workspaceId={workspace.id}
              issues={linkedIssues}
              isLoading={linkedIssuesQuery.isLoading}
              error={linkedIssuesQuery.error as Error | null}
              project={project}
            />
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={!!showLeaveConfirm} onOpenChange={(open) => { if (!open) setShowLeaveConfirm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Unsaved changes</DialogTitle>
            <DialogDescription>You have unsaved changes. Leave this tab and discard them?</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setShowLeaveConfirm(null)}>Stay</Button>
            <Button variant="destructive" onClick={() => {
              if (showLeaveConfirm) { setShowLeaveConfirm(null); handleTabChange(showLeaveConfirm.nextTab, true); }
            }}>Leave</Button>
          </div>
        </DialogContent>
      </Dialog>
      <ExecutionWorkspaceCloseDialog
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        currentStatus={workspace.status}
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        onClosed={(nextWorkspace) => {
          queryClient.setQueryData(queryKeys.executionWorkspaces.detail(nextWorkspace.id), nextWorkspace);
          queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.closeReadiness(nextWorkspace.id) });
          queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.workspaceOperations(nextWorkspace.id) });
          if (project) {
            queryClient.invalidateQueries({ queryKey: queryKeys.projects.detail(project.id) });
            queryClient.invalidateQueries({ queryKey: queryKeys.executionWorkspaces.list(project.companyId, { projectId: project.id }) });
          }
          if (sourceIssue) {
            queryClient.invalidateQueries({ queryKey: queryKeys.issues.detail(sourceIssue.id) });
          }
        }}
      />
    </>
  );
}
