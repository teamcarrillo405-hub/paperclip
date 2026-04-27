import { useEffect, useMemo } from "react";
import { Link, Navigate } from "@/lib/router";
import { useQuery } from "@tanstack/react-query";
import type { ExecutionWorkspace, Issue, Project } from "@paperclipai/shared";
import { executionWorkspacesApi } from "../api/execution-workspaces";
import { instanceSettingsApi } from "../api/instanceSettings";
import { issuesApi } from "../api/issues";
import { projectsApi } from "../api/projects";
import { ProjectWorkspacesContent } from "../components/ProjectWorkspacesContent";
import { PageSkeleton } from "../components/PageSkeleton";
import { AlertCircle, Building2, GitBranch, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "../components/EmptyState";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useCompany } from "../context/CompanyContext";
import { buildProjectWorkspaceSummaries, type ProjectWorkspaceSummary } from "../lib/project-workspaces-tab";
import { queryKeys } from "../lib/queryKeys";
import { projectRouteRef } from "../lib/utils";

type ProjectWorkspaceGroup = {
  project: Project;
  projectRef: string;
  summaries: ProjectWorkspaceSummary[];
  lastUpdatedAt: Date;
  runningServiceCount: number;
};

function buildProjectWorkspaceGroups(input: {
  projects: Project[];
  issues: Issue[];
  executionWorkspaces: ExecutionWorkspace[];
}): ProjectWorkspaceGroup[] {
  const issuesByProjectId = new Map<string, Issue[]>();
  for (const issue of input.issues) {
    if (!issue.projectId) continue;
    const existing = issuesByProjectId.get(issue.projectId) ?? [];
    existing.push(issue);
    issuesByProjectId.set(issue.projectId, existing);
  }

  const executionWorkspacesByProjectId = new Map<string, ExecutionWorkspace[]>();
  for (const workspace of input.executionWorkspaces) {
    if (!workspace.projectId) continue;
    const existing = executionWorkspacesByProjectId.get(workspace.projectId) ?? [];
    existing.push(workspace);
    executionWorkspacesByProjectId.set(workspace.projectId, existing);
  }

  return input.projects
    .map((project) => {
      const summaries = buildProjectWorkspaceSummaries({
        project,
        issues: issuesByProjectId.get(project.id) ?? [],
        executionWorkspaces: executionWorkspacesByProjectId.get(project.id) ?? [],
      });
      if (summaries.length === 0) return null;
      return {
        project,
        projectRef: projectRouteRef(project),
        summaries,
        lastUpdatedAt: summaries.reduce(
          (latest, summary) => summary.lastUpdatedAt.getTime() > latest.getTime() ? summary.lastUpdatedAt : latest,
          new Date(0),
        ),
        runningServiceCount: summaries.reduce((count, summary) => count + summary.runningServiceCount, 0),
      };
    })
    .filter((group): group is ProjectWorkspaceGroup => group !== null)
    .sort((a, b) => {
      const runningDiff = b.runningServiceCount - a.runningServiceCount;
      if (runningDiff !== 0) return runningDiff;
      const updatedDiff = b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime();
      return updatedDiff !== 0 ? updatedDiff : a.project.name.localeCompare(b.project.name);
    });
}

export function Workspaces() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const experimentalSettingsQuery = useQuery({
    queryKey: queryKeys.instance.experimentalSettings,
    queryFn: () => instanceSettingsApi.getExperimental(),
  });
  const isolatedWorkspacesEnabled = experimentalSettingsQuery.data?.enableIsolatedWorkspaces === true;

  const { data: projects = [], isLoading: projectsLoading, error: projectsError, refetch: refetchProjects } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.projects.list(selectedCompanyId) : ["projects", "__workspaces__", "disabled"],
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && isolatedWorkspacesEnabled),
  });
  const { data: issues = [], isLoading: issuesLoading, error: issuesError, refetch: refetchIssues } = useQuery({
    queryKey: selectedCompanyId ? queryKeys.issues.list(selectedCompanyId) : ["issues", "__workspaces__", "disabled"],
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && isolatedWorkspacesEnabled),
  });
  const {
    data: executionWorkspaces = [],
    isLoading: executionWorkspacesLoading,
    error: executionWorkspacesError,
    refetch: refetchExecutionWorkspaces,
  } = useQuery({
    queryKey: selectedCompanyId
      ? queryKeys.executionWorkspaces.list(selectedCompanyId)
      : ["execution-workspaces", "__workspaces__", "disabled"],
    queryFn: () => executionWorkspacesApi.list(selectedCompanyId!),
    enabled: Boolean(selectedCompanyId && isolatedWorkspacesEnabled),
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Workspaces" }]);
  }, [setBreadcrumbs]);

  const groups = useMemo(
    () => buildProjectWorkspaceGroups({ projects, issues, executionWorkspaces }),
    [executionWorkspaces, issues, projects],
  );
  const dataLoading = projectsLoading || issuesLoading || executionWorkspacesLoading;
  const error = (projectsError ?? issuesError ?? executionWorkspacesError) as Error | null;

  if (experimentalSettingsQuery.isLoading) return <PageSkeleton variant="list" />;
  if (experimentalSettingsQuery.isError) return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-destructive">Error</p>
        <p className="text-sm text-destructive">Could not load workspace settings.</p>
      </div>
      <Button size="sm" variant="ghost" className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0"
        disabled={experimentalSettingsQuery.isRefetching}
        aria-busy={experimentalSettingsQuery.isRefetching}
        onClick={() => experimentalSettingsQuery.refetch()}>
        {experimentalSettingsQuery.isRefetching ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
  if (!selectedCompanyId) return (
    <EmptyState icon={Building2} message="Select a company to view workspaces." />
  );
  if (!isolatedWorkspacesEnabled) return (
    <EmptyState icon={Settings} message="Isolated workspaces are disabled for this instance. Contact your administrator to enable them in instance settings." />
  );
  if (dataLoading) return <PageSkeleton variant="list" />;
  if (error) {
    const isDataRetrying = projectsLoading || issuesLoading || executionWorkspacesLoading;
    const refetchAll = () => {
      void refetchProjects();
      void refetchIssues();
      void refetchExecutionWorkspaces();
    };
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-destructive">Error</p>
          <p className="text-sm text-destructive">{error.message || "Failed to load workspaces."}</p>
        </div>
        <Button size="sm" variant="ghost" className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0"
          disabled={isDataRetrying}
          aria-busy={isDataRetrying}
          onClick={refetchAll}>
          {isDataRetrying ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workspaces</h1>
        <p className="text-sm text-muted-foreground mt-1">Active execution environments across all projects.</p>
      </div>

      {groups.length === 0 ? (
        <EmptyState icon={GitBranch} message="No workspace activity yet." />
      ) : (
        <div className="space-y-8">
          {groups.map((group) => {
            const headingId = `project-group-${group.project.id}`;
            return (
            <section key={group.project.id} className="space-y-3" aria-labelledby={headingId}>
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div className="min-w-0">
                  <h2 id={headingId} className="text-base font-semibold">
                    <Link
                      to={`/projects/${group.projectRef}/workspaces`}
                      className="hover:underline"
                    >
                      {group.project.name}
                    </Link>
                  </h2>
                  {group.project.description ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {group.project.description}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {group.summaries.length} workspace{group.summaries.length === 1 ? "" : "s"}
                  </span>
                  {group.runningServiceCount > 0 && (
                    <span
                      className="border-l border-border pl-2 text-xs text-emerald-600 dark:text-emerald-400"
                      aria-label={`${group.runningServiceCount} running service${group.runningServiceCount === 1 ? "" : "s"}`}
                    >
                      {group.runningServiceCount} running
                    </span>
                  )}
                </div>
              </div>
              <ProjectWorkspacesContent
                companyId={selectedCompanyId!}
                projectId={group.project.id}
                projectRef={group.projectRef}
                summaries={group.summaries}
              />
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
