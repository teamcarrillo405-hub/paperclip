import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ActivityEvent, Agent } from "@paperclipai/shared";
import { activityApi } from "../api/activity";
import { accessApi } from "../api/access";
import { agentsApi } from "../api/agents";
import { buildCompanyUserProfileMap } from "../lib/company-members";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { queryKeys } from "../lib/queryKeys";
import { EmptyState } from "../components/EmptyState";
import { ActivityRow } from "../components/ActivityRow";
import { PageSkeleton } from "../components/PageSkeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { History, AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const ACTIVITY_PAGE_LIMIT = 200;

function detailString(event: ActivityEvent, ...keys: string[]) {
  const details = event.details;
  for (const key of keys) {
    const value = details?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function activityEntityName(event: ActivityEvent) {
  if (event.entityType === "issue") return detailString(event, "identifier", "issueIdentifier");
  if (event.entityType === "project") return detailString(event, "projectName", "name", "title");
  if (event.entityType === "goal") return detailString(event, "goalTitle", "title", "name");
  return detailString(event, "name", "title");
}

function activityEntityTitle(event: ActivityEvent) {
  if (event.entityType === "issue") return detailString(event, "issueTitle", "title");
  return null;
}

export function Activity() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    setBreadcrumbs([{ label: "Activity" }]);
  }, [setBreadcrumbs]);

  const { data, isLoading, isRefetching, error, refetch } = useQuery({
    queryKey: [...queryKeys.activity(selectedCompanyId!), { limit: ACTIVITY_PAGE_LIMIT }],
    queryFn: () => activityApi.list(selectedCompanyId!, { limit: ACTIVITY_PAGE_LIMIT }),
    enabled: !!selectedCompanyId,
  });

  const { data: agents } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const { data: companyMembers } = useQuery({
    queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!),
    queryFn: () => accessApi.listUserDirectory(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const userProfileMap = useMemo(
    () => buildCompanyUserProfileMap(companyMembers?.users),
    [companyMembers?.users],
  );

  const agentMap = useMemo(() => {
    const map = new Map<string, Agent>();
    for (const a of agents ?? []) map.set(a.id, a);
    return map;
  }, [agents]);

  const entityNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents ?? []) map.set(`agent:${a.id}`, a.name);
    for (const event of data ?? []) {
      const name = activityEntityName(event);
      if (name) map.set(`${event.entityType}:${event.entityId}`, name);
    }
    return map;
  }, [data, agents]);

  const entityTitleMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const event of data ?? []) {
      const title = activityEntityTitle(event);
      if (title) map.set(`${event.entityType}:${event.entityId}`, title);
    }
    return map;
  }, [data]);

  if (!selectedCompanyId) {
    return <EmptyState icon={History} message="Select a company to view activity." />;
  }

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  const filtered =
    data && filter !== "all"
      ? data.filter((e) => e.entityType === filter)
      : data;

  const entityTypes = data
    ? [...new Set(data.map((e) => e.entityType))].sort()
    : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Activity
          {filtered !== undefined && (
            <span className="ml-2 text-base text-muted-foreground font-normal">({filtered.length})</span>
          )}
        </h1>
      </div>
      {(!error || data) && (
        <div className="flex items-center justify-end gap-2">
          <Select value={filter} onValueChange={setFilter} aria-label="Filter activity by type">
            <SelectTrigger className="w-[140px] h-8 text-xs">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {entityTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/\b\w/g, (c) => c.toUpperCase())}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8 shrink-0"
            aria-label="Refresh activity"
            disabled={isRefetching}
            onClick={() => refetch()}
          >
            <RotateCcw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} aria-hidden="true" />
          </Button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
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
      )}

      {filtered && filtered.length === 0 && (
        <EmptyState
          icon={History}
          message={
            filter !== "all"
              ? `No ${filter.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())} events found.`
              : "No activity yet."
          }
        />
      )}

      <div aria-live="polite" aria-atomic="false">
      {filtered && filtered.length > 0 && (
        <>
          <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
            {filtered.map((event) => (
              <ActivityRow
                key={event.id}
                event={event}
                agentMap={agentMap}
                userProfileMap={userProfileMap}
                entityNameMap={entityNameMap}
                entityTitleMap={entityTitleMap}
              />
            ))}
          </div>
          {(data?.length ?? 0) >= ACTIVITY_PAGE_LIMIT && (
            <p className="text-xs text-muted-foreground text-center py-1">
              Showing the {ACTIVITY_PAGE_LIMIT} most recent events. Older activity may not appear.
            </p>
          )}
        </>
      )}
      </div>
    </div>
  );
}
