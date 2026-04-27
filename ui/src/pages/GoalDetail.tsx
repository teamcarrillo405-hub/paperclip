import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { goalsApi } from "../api/goals";
import { ApiError } from "../api/client";
import { projectsApi } from "../api/projects";
import { assetsApi } from "../api/assets";
import { usePanel } from "../context/PanelContext";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { GoalProperties } from "../components/GoalProperties";
import { GoalTree } from "../components/GoalTree";
import { StatusBadge } from "../components/StatusBadge";
import { InlineEditor } from "../components/InlineEditor";
import { EntityRow } from "../components/EntityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { cn, projectUrl } from "../lib/utils";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, SlidersHorizontal, AlertCircle, Target, X, LoaderCircle } from "lucide-react";
import type { Goal, Project } from "@paperclipai/shared";

interface GoalPropertiesToggleButtonProps {
  panelVisible: boolean;
  onShowProperties: () => void;
}

export function GoalPropertiesToggleButton({
  panelVisible,
  onShowProperties,
}: GoalPropertiesToggleButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className={cn(
        "hidden md:inline-flex shrink-0 transition-opacity duration-200",
        panelVisible ? "opacity-0 pointer-events-none w-0 overflow-hidden" : "opacity-100",
      )}
      onClick={onShowProperties}
      aria-label="Show properties"
      aria-hidden={panelVisible}
      tabIndex={panelVisible ? -1 : 0}
    >
      <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
    </Button>
  );
}

export function GoalDetail() {
  const { goalId } = useParams<{ goalId: string }>();
  const navigate = useNavigate();
  const { selectedCompanyId, setSelectedCompanyId } = useCompany();
  const { openNewGoal } = useDialog();
  const { openPanel, closePanel, panelVisible, setPanelVisible } = usePanel();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  const [updateError, setUpdateError] = useState<string | null>(null);

  const {
    data: goal,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: queryKeys.goals.detail(goalId!),
    queryFn: () => goalsApi.get(goalId!),
    enabled: !!goalId
  });
  const resolvedCompanyId = goal?.companyId ?? selectedCompanyId;

  const { data: allGoals } = useQuery({
    queryKey: queryKeys.goals.list(resolvedCompanyId!),
    queryFn: () => goalsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId
  });

  const { data: allProjects } = useQuery({
    queryKey: queryKeys.projects.list(resolvedCompanyId!),
    queryFn: () => projectsApi.list(resolvedCompanyId!),
    enabled: !!resolvedCompanyId
  });

  useEffect(() => {
    if (!goal?.companyId || goal.companyId === selectedCompanyId) return;
    setSelectedCompanyId(goal.companyId, { source: "route_sync" });
  }, [goal?.companyId, selectedCompanyId, setSelectedCompanyId]);

  const updateGoal = useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      goalsApi.update(goalId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.goals.detail(goalId!)
      });
      if (resolvedCompanyId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(resolvedCompanyId)
        });
      }
    },
    onError: (err: unknown) => {
      setUpdateError(err instanceof Error ? err.message : "Failed to update goal.");
    },
  });

  const uploadImage = useMutation({
    mutationFn: async (file: File) => {
      if (!resolvedCompanyId) throw new Error("No company selected");
      return assetsApi.uploadImage(
        resolvedCompanyId,
        file,
        `goals/${goalId ?? "draft"}`
      );
    },
    onError: (err: unknown) => {
      setUpdateError(err instanceof Error ? err.message : "Failed to upload image.");
    },
  });

  const childGoals = (allGoals ?? []).filter((g) => g.parentId === goalId);
  const linkedProjects = (allProjects ?? []).filter((p) => {
    if (!goalId) return false;
    if (p.goalIds.includes(goalId)) return true;
    if (p.goals.some((goalRef) => goalRef.id === goalId)) return true;
    return p.goalId === goalId;
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: "Goals", href: "/goals" },
      { label: goal?.title ?? goalId ?? "Goal" }
    ]);
  }, [setBreadcrumbs, goal, goalId]);

  const openPanelRef = useRef(openPanel);
  const closePanelRef = useRef(closePanel);
  useEffect(() => { openPanelRef.current = openPanel; }, [openPanel]);
  useEffect(() => { closePanelRef.current = closePanel; }, [closePanel]);

  const updateGoalMutateRef = useRef(updateGoal.mutate);
  useEffect(() => { updateGoalMutateRef.current = updateGoal.mutate; }, [updateGoal.mutate]);

  useEffect(() => {
    if (goal) {
      openPanelRef.current(
        <GoalProperties
          goal={goal}
          onUpdate={(data) => updateGoalMutateRef.current(data)}
        />
      );
    }
    return () => closePanelRef.current();
  }, [goal]);

  if (isLoading) return <PageSkeleton variant="detail" />;
  if (error) return (
    <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
      <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-destructive">{error.message}</p>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0"
        disabled={isRefetching}
        onClick={() => refetch()}
      >
        {isRefetching ? "Retrying…" : "Retry"}
      </Button>
    </div>
  );
  if (!goal) {
    const anyError = error as unknown;
    const notFoundMessage =
      anyError instanceof ApiError && anyError.status === 403
        ? "You don't have permission to view this goal."
        : "This goal could not be found.";
    return (
      <EmptyState icon={Target} message={notFoundMessage} action="Back to goals" onAction={() => navigate("/goals")} />
    );
  }

  return (
    <div className="space-y-6">
      {updateError && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span className="flex-1">{updateError}</span>
          <button
            type="button"
            aria-label="Dismiss error"
            onClick={() => setUpdateError(null)}
            className="text-destructive/70 hover:text-destructive ml-1"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <p className="text-xs uppercase text-muted-foreground m-0">
            <span className="sr-only">Level: </span>{goal.level}
          </p>
          <StatusBadge status={goal.status} />
          <div className="ml-auto">
            <GoalPropertiesToggleButton
              panelVisible={panelVisible}
              onShowProperties={() => setPanelVisible(true)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <InlineEditor
            value={goal.title}
            onSave={(title) => updateGoal.mutate({ title })}
            as="h1"
            className="text-2xl font-semibold"
            disabled={updateGoal.isPending}
          />
          {updateGoal.isPending ? (
            <LoaderCircle className="size-4 animate-spin text-muted-foreground shrink-0" aria-hidden="true" />
          ) : null}
        </div>

        <InlineEditor
          value={goal.description ?? ""}
          onSave={(description) => updateGoal.mutate({ description })}
          as="p"
          className="text-sm text-muted-foreground"
          placeholder="Add a description..."
          multiline
          disabled={updateGoal.isPending}
          imageUploadHandler={async (file) => {
            const asset = await uploadImage.mutateAsync(file);
            return asset.contentPath;
          }}
        />
      </div>

      <Tabs defaultValue="children">
        <TabsList>
          <TabsTrigger value="children">
            Sub-Goals <span aria-label={`${childGoals.length} sub-goal${childGoals.length === 1 ? "" : "s"}`} className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-mono tabular-nums">{childGoals.length}</span>
          </TabsTrigger>
          <TabsTrigger value="projects">
            Projects <span aria-label={`${linkedProjects.length} project${linkedProjects.length === 1 ? "" : "s"}`} className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs font-mono tabular-nums">{linkedProjects.length}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="children" className="mt-4 space-y-3">
          {childGoals.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No sub-goals yet.</p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openNewGoal({ parentId: goalId })}
              >
                <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                Sub Goal
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-start">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openNewGoal({ parentId: goalId })}
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                  Sub Goal
                </Button>
              </div>
              <GoalTree goals={childGoals} goalLink={(g) => `/goals/${g.id}`} />
            </>
          )}
        </TabsContent>

        <TabsContent value="projects" className="mt-4">
          {linkedProjects.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No linked projects yet.</p>
              <Button variant="outline" size="sm" asChild><Link to="/projects">Browse projects</Link></Button>
            </div>
          ) : (
            <div className="rounded-lg border border-border overflow-hidden">
              {linkedProjects.map((project) => (
                <EntityRow
                  key={project.id}
                  title={project.name}
                  subtitle={project.description ?? undefined}
                  to={projectUrl(project)}
                  trailing={<StatusBadge status={project.status} />}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
