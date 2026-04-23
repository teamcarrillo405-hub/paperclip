import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, Activity, RefreshCw } from "lucide-react";
import { guardianApi, type GuardianIncident } from "../api/guardian";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const SEVERITY_ORDER: Record<string, number> = { critical: 0, warning: 1, info: 2 };

function severityBadgeVariant(severity: string): "default" | "secondary" | "destructive" | "outline" {
  if (severity === "critical") return "destructive";
  if (severity === "warning") return "default";
  return "secondary";
}

function formatAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function formatIncidentType(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function GuardianDashboard() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "AutoPilot Guardian" }]);
  }, [setBreadcrumbs]);

  const statusQuery = useQuery({
    queryKey: ["guardian", "status"],
    queryFn: () => guardianApi.status(),
    refetchInterval: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ["guardian", "summary", selectedCompanyId],
    queryFn: () => guardianApi.summary(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const incidentsQuery = useQuery({
    queryKey: ["guardian", "incidents", selectedCompanyId, "open"],
    queryFn: () => guardianApi.incidents(selectedCompanyId!, { resolved: false, limit: 100 }),
    enabled: !!selectedCompanyId,
    refetchInterval: 30_000,
  });

  const resolveMutation = useMutation({
    mutationFn: (id: string) => guardianApi.resolve(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["guardian", "incidents", selectedCompanyId] });
      queryClient.invalidateQueries({ queryKey: ["guardian", "summary", selectedCompanyId] });
    },
  });

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={Shield}
          message="Select a company to view the AutoPilot Guardian dashboard."
        />
      </div>
    );
  }

  if (statusQuery.isLoading || incidentsQuery.isLoading || summaryQuery.isLoading) {
    return <PageSkeleton />;
  }

  const status = statusQuery.data;
  const summary = summaryQuery.data;
  const incidents = incidentsQuery.data?.incidents ?? [];
  const isEnabled = status?.enabled ?? false;

  const sortedIncidents = [...incidents].sort((a, b) => {
    const sev = (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3);
    if (sev !== 0) return sev;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {isEnabled ? (
            <ShieldCheck className="h-8 w-8 text-green-600" />
          ) : (
            <Shield className="h-8 w-8 text-muted-foreground" />
          )}
          <div>
            <h1 className="text-2xl font-semibold">AutoPilot Guardian</h1>
            <p className="text-sm text-muted-foreground">
              Self-healing monitoring for your agent workforce — stall detection, auto-retry, and quality review.
            </p>
          </div>
        </div>
        <Badge variant={isEnabled ? "default" : "outline"}>{isEnabled ? "ON" : "OFF"}</Badge>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <SummaryTile
          label="Critical"
          value={summary?.bySeverity.critical ?? 0}
          icon={ShieldAlert}
          tone="destructive"
        />
        <SummaryTile
          label="Warnings"
          value={summary?.bySeverity.warning ?? 0}
          icon={AlertTriangle}
          tone="warning"
        />
        <SummaryTile
          label="Open (info)"
          value={summary?.bySeverity.info ?? 0}
          icon={Activity}
          tone="default"
        />
        <SummaryTile
          label="Resolved today"
          value={summary?.resolvedToday ?? 0}
          icon={ShieldCheck}
          tone="success"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <WatchdogCard
          title="WatchdogOne"
          description="Stall detection and auto-retry"
          enabled={status?.watchdogOne.enabled ?? false}
          lastRunAt={status?.watchdogOne.lastRunAt ?? null}
          report={
            status?.watchdogOne.lastReport
              ? [
                  { label: "Scanned runs", value: status.watchdogOne.lastReport.scannedRuns },
                  { label: "Stalled runs", value: status.watchdogOne.lastReport.stalledRuns },
                  { label: "Retries scheduled", value: status.watchdogOne.lastReport.retriesScheduled },
                  { label: "Retries exhausted", value: status.watchdogOne.lastReport.retriesExhausted },
                  { label: "Blockers detected", value: status.watchdogOne.lastReport.blockersDetected },
                ]
              : null
          }
        />
        <WatchdogCard
          title="WatchdogTwo"
          description="Quality review of completed runs"
          enabled={status?.watchdogTwo.enabled ?? false}
          lastRunAt={status?.watchdogTwo.lastRunAt ?? null}
          report={
            status?.watchdogTwo.lastReport
              ? [
                  { label: "Scanned runs", value: status.watchdogTwo.lastReport.scannedRuns },
                  { label: "Reviewed", value: status.watchdogTwo.lastReport.reviewedRuns },
                  { label: "Incidents created", value: status.watchdogTwo.lastReport.incidentsCreated },
                  { label: "Escalations", value: status.watchdogTwo.lastReport.escalations },
                ]
              : null
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Open incidents</CardTitle>
          <CardDescription>
            {sortedIncidents.length === 0
              ? "No open incidents — your agents are healthy."
              : `${sortedIncidents.length} open incident${sortedIncidents.length === 1 ? "" : "s"}`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedIncidents.length === 0 ? (
            <EmptyState icon={ShieldCheck} message="All clear — no incidents to review right now." />
          ) : (
            <div className="divide-y divide-border">
              {sortedIncidents.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  onResolve={() => resolveMutation.mutate(incident.id)}
                  isResolving={resolveMutation.isPending && resolveMutation.variables === incident.id}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryTile({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: "default" | "warning" | "destructive" | "success";
}) {
  const toneClasses: Record<typeof tone, string> = {
    default: "text-foreground",
    warning: "text-amber-600",
    destructive: "text-destructive",
    success: "text-green-600",
  };
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 py-6">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className={`mt-1 text-3xl font-semibold ${toneClasses[tone]}`}>{value}</div>
        </div>
        <Icon className={`h-8 w-8 ${toneClasses[tone]}`} />
      </CardContent>
    </Card>
  );
}

function WatchdogCard({
  title,
  description,
  enabled,
  lastRunAt,
  report,
}: {
  title: string;
  description: string;
  enabled: boolean;
  lastRunAt: string | null;
  report: { label: string; value: number }[] | null;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              {title}
            </CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
          <Badge variant={enabled ? "default" : "outline"}>{enabled ? "Active" : "Disabled"}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-sm text-muted-foreground">
          Last run: {lastRunAt ? formatAgo(lastRunAt) : "never"}
        </div>
        {report && (
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {report.map((entry) => (
              <div key={entry.label} className="flex justify-between">
                <span className="text-muted-foreground">{entry.label}</span>
                <span className="font-mono">{entry.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IncidentRow({
  incident,
  onResolve,
  isResolving,
}: {
  incident: GuardianIncident;
  onResolve: () => void;
  isResolving: boolean;
}) {
  return (
    <div className="flex items-start gap-4 py-3">
      <Badge variant={severityBadgeVariant(incident.severity)} className="mt-0.5 shrink-0">
        {incident.severity.toUpperCase()}
      </Badge>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{formatIncidentType(incident.incidentType)}</span>
          {incident.agentName && (
            <span className="text-muted-foreground">· {incident.agentName}</span>
          )}
          <span className="text-xs text-muted-foreground">· {formatAgo(incident.createdAt)}</span>
          {incident.autoActionTaken && (
            <Badge variant="outline" className="text-xs">
              {incident.autoActionTaken}
            </Badge>
          )}
        </div>
        <div className="mt-1 text-sm text-muted-foreground">{incident.description}</div>
        {incident.recommendedAction && (
          <div className="mt-1 text-xs text-muted-foreground italic">
            → {incident.recommendedAction}
          </div>
        )}
      </div>
      <Button size="sm" variant="outline" onClick={onResolve} disabled={isResolving}>
        {isResolving ? "Resolving…" : "Resolve"}
      </Button>
    </div>
  );
}
