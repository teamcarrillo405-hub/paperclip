import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, LoaderCircle, UserPlus2 } from "lucide-react";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { queryKeys } from "@/lib/queryKeys";

export function JoinRequestQueue() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<"pending_approval" | "approved" | "rejected">("pending_approval");
  const [requestType, setRequestType] = useState<"all" | "human" | "agent">("all");
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Inbox", href: "/inbox" },
      { label: "Join Requests" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const requestsQuery = useQuery({
    queryKey: queryKeys.access.joinRequests(selectedCompanyId ?? "", `${status}:${requestType}`),
    queryFn: () =>
      accessApi.listJoinRequests(
        selectedCompanyId!,
        status,
        requestType === "all" ? undefined : requestType,
      ),
    enabled: !!selectedCompanyId,
  });

  const approveMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.approveJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!, `${status}:${requestType}`) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyMembers(selectedCompanyId!) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.companyUserDirectory(selectedCompanyId!) });
      pushToast({ title: "Join request approved", tone: "success" });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Failed to approve join request. Please try again.";
      pushToast({ title: message, tone: "error" });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (requestId: string) => accessApi.rejectJoinRequest(selectedCompanyId!, requestId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.access.joinRequests(selectedCompanyId!, `${status}:${requestType}`) });
      pushToast({ title: "Join request rejected", tone: "success" });
    },
    onError: (error: unknown) => {
      const message =
        error instanceof ApiError
          ? error.message
          : "Failed to reject join request. Please try again.";
      pushToast({ title: message, tone: "error" });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={UserPlus2} message="Select a company to view join requests." />;
  }

  if (requestsQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (requestsQuery.error) {
    const message =
      requestsQuery.error instanceof ApiError && requestsQuery.error.status === 403
        ? "You do not have permission to review join requests for this company."
        : requestsQuery.error instanceof Error
          ? requestsQuery.error.message
          : "Failed to load join requests.";
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-destructive">{message}</p>
        </div>
        {!(requestsQuery.error instanceof ApiError && requestsQuery.error.status === 403) ? (
          <Button size="sm" variant="ghost" className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0"
            disabled={requestsQuery.isRefetching}
            onClick={() => requestsQuery.refetch()}>
            Retry
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <UserPlus2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-semibold tracking-tight">Join Request Queue</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Review pending human and agent join requests for this company. Approve to grant access; rejections are final.
        </p>
      </div>

      <fieldset className="rounded-xl border border-border bg-card p-4">
        <legend className="sr-only">Filter join requests</legend>
        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jrq-status-filter">Status</Label>
            <Select value={status} onValueChange={(value) => setStatus(value as "pending_approval" | "approved" | "rejected")}>
              <SelectTrigger id="jrq-status-filter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_approval">Pending approval</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="jrq-type-filter">Request type</Label>
            <Select value={requestType} onValueChange={(value) => setRequestType(value as "all" | "human" | "agent")}>
              <SelectTrigger id="jrq-type-filter" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="human">Human</SelectItem>
                <SelectItem value="agent">Agent</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </fieldset>

      <div className={cn("space-y-4", requestsQuery.isFetching && "opacity-60 transition-opacity")}>
        {(requestsQuery.data ?? []).length === 0 ? (
          <div role="status" aria-live="polite" className="rounded-xl border border-dashed border-border px-4 py-8 text-sm text-muted-foreground">
            No join requests match the current filters.
          </div>
        ) : (
          <ul className="space-y-4">
            {requestsQuery.data!.map((request) => {
              const requesterName =
                request.requestType === "human"
                  ? request.requesterUser?.name || request.requestEmailSnapshot || request.requestingUserId || "unknown"
                  : request.agentName || "unknown";

              const secondaryLine =
                request.requestType === "human"
                  ? request.requesterUser?.email || request.requestEmailSnapshot || request.requestingUserId
                  : request.capabilities || request.requestIp;

              const isPending = pendingIds.has(request.id);

              return (
                <li key={request.id} aria-label={`Join request from ${requesterName}`} className={cn("rounded-xl border border-border bg-card p-4", request.status === "rejected" && "opacity-60")}>
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={request.status === "pending_approval" ? "secondary" : request.status === "approved" ? "outline" : "destructive"}
                          className={request.status === "approved" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 forced-colors:outline forced-colors:outline-1" : undefined}
                          data-status={request.status === "approved" ? "approved" : undefined}
                          aria-hidden="true"
                        >
                          {request.status.replace("_", " ")}
                        </Badge>
                        <span className="sr-only">Status: {request.status.replace(/_/g, " ")}</span>
                        <Badge variant="outline">{request.requestType}</Badge>
                        {request.adapterType ? <Badge variant="outline" aria-label={`Adapter: ${request.adapterType}`}>{request.adapterType}</Badge> : null}
                      </div>
                      <div>
                        <div className="text-base font-medium">
                          {requesterName === "unknown"
                            ? request.requestType === "human"
                              ? "Unknown human requester"
                              : "Unknown agent requester"
                            : requesterName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {secondaryLine
                            ? secondaryLine
                            : <span className="text-muted-foreground italic text-xs">No contact info on file</span>}
                        </div>
                      </div>
                    </div>

                    {request.status === "pending_approval" ? (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          aria-label={`Reject request from ${requesterName}`}
                          aria-busy={isPending}
                          onClick={() => {
                            const id = request.id;
                            setPendingIds((prev) => new Set(prev).add(id));
                            rejectMutation.mutate(id, {
                              onSettled: () => {
                                setPendingIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(id);
                                  return next;
                                });
                              },
                            });
                          }}
                          disabled={isPending}
                        >
                          {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                          Reject
                        </Button>
                        <Button
                          aria-label={`Approve request from ${requesterName}`}
                          aria-busy={isPending}
                          onClick={() => {
                            const id = request.id;
                            setPendingIds((prev) => new Set(prev).add(id));
                            approveMutation.mutate(id, {
                              onSettled: () => {
                                setPendingIds((prev) => {
                                  const next = new Set(prev);
                                  next.delete(id);
                                  return next;
                                });
                              },
                            });
                          }}
                          disabled={isPending}
                        >
                          {isPending && <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />}
                          Approve
                        </Button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 grid gap-3 text-sm text-muted-foreground md:grid-cols-2">
                    <div className="rounded-lg border border-border bg-background px-3 py-2">
                      <h3 className="text-xs font-medium uppercase tracking-wide">Invite context</h3>
                      <div className="mt-2">
                        {request.invite
                          ? `${request.invite.allowedJoinTypes} join invite${request.invite.humanRole ? ` • default role ${request.invite.humanRole}` : ""}`
                          : <span className="italic text-muted-foreground/70">Invite metadata unavailable</span>}
                      </div>
                      {request.invite?.inviteMessage ? (
                        <div className="mt-2 text-foreground">{request.invite.inviteMessage}</div>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-border bg-background px-3 py-2">
                      <h3 className="text-xs font-medium uppercase tracking-wide">Request details</h3>
                      <div className="mt-2">Submitted {new Date(request.createdAt).toLocaleString()}</div>
                      <div className="break-all"><span><span className="sr-only">Source IP: </span><span className="font-mono text-xs">{request.requestIp}</span></span></div>
                      {request.requestType === "agent" && request.capabilities ? <div>{request.capabilities}</div> : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
