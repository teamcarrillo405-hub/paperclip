import { useEffect, useMemo, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Check, ExternalLink, LoaderCircle, MailPlus } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { PageSkeleton } from "../components/PageSkeleton";
import { accessApi } from "@/api/access";
import { ApiError } from "@/api/client";
import { Button } from "@/components/ui/button";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useCompany } from "@/context/CompanyContext";
import { useToast } from "@/context/ToastContext";
import { Link } from "@/lib/router";
import { queryKeys } from "@/lib/queryKeys";

const inviteRoleOptions = [
  {
    value: "viewer",
    label: "Viewer",
    description: "Can view company work and follow along without operational permissions.",
    gets: "No built-in grants.",
  },
  {
    value: "operator",
    label: "Operator",
    description: "Recommended for people who need to help run work without managing access.",
    gets: "Can assign tasks.",
  },
  {
    value: "admin",
    label: "Admin",
    description: "Recommended for operators who need to invite people, create agents, and approve joins.",
    gets: "Can create agents, invite users, assign tasks, and approve join requests.",
  },
  {
    value: "owner",
    label: "Owner",
    description: "Full company access, including membership and permission management.",
    gets: "Everything in Admin, plus managing members and permission grants.",
  },
] as const;

const INVITE_HISTORY_PAGE_SIZE = 5;

function isInviteHistoryRow(value: unknown): value is Awaited<ReturnType<typeof accessApi.listInvites>>["invites"][number] {
  if (!value || typeof value !== "object") return false;
  return "id" in value && "state" in value && "createdAt" in value;
}

export function CompanyInvites() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [humanRole, setHumanRole] = useState<"owner" | "admin" | "operator" | "viewer">("operator");
  const [latestInviteUrl, setLatestInviteUrl] = useState<string | null>(null);
  const [latestInviteCopied, setLatestInviteCopied] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    if (!latestInviteCopied) return;
    const timeout = window.setTimeout(() => {
      setLatestInviteCopied(false);
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [latestInviteCopied]);

  async function copyInviteUrl(url: string) {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        return true;
      }
    } catch {
      // Fall through to the unavailable message below.
    }

    pushToast({
      title: "Clipboard unavailable",
      body: "Copy the invite URL manually from the field below.",
      tone: "warn",
    });
    return false;
  }

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings", href: "/company/settings" },
      { label: "Invites" },
    ]);
  }, [selectedCompany?.name, setBreadcrumbs]);

  const inviteHistoryQueryKey = queryKeys.access.invites(selectedCompanyId ?? "", "all", INVITE_HISTORY_PAGE_SIZE);
  const invitesQuery = useInfiniteQuery({
    queryKey: inviteHistoryQueryKey,
    queryFn: ({ pageParam }) =>
      accessApi.listInvites(selectedCompanyId!, {
        limit: INVITE_HISTORY_PAGE_SIZE,
        offset: pageParam,
      }),
    enabled: !!selectedCompanyId,
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const inviteHistory = useMemo(
    () =>
      invitesQuery.data?.pages.flatMap((page) =>
        Array.isArray(page?.invites) ? page.invites.filter(isInviteHistoryRow) : [],
      ) ?? [],
    [invitesQuery.data?.pages],
  );

  const createInviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createCompanyInvite(selectedCompanyId!, {
        allowedJoinTypes: "human",
        humanRole,
        agentMessage: null,
      }),
    onSuccess: async (invite) => {
      setLatestInviteUrl(invite.inviteUrl);
      setLatestInviteCopied(false);
      const copied = await copyInviteUrl(invite.inviteUrl);

      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({
        title: "Invite created",
        body: copied ? "Invite ready below and copied to clipboard." : "Invite ready below.",
        tone: "success",
      });
    },
    onError: (error) => {
      pushToast({
        title: "Failed to create invite",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (inviteId: string) => {
      setRevokingId(inviteId);
      return accessApi.revokeInvite(inviteId);
    },
    onSuccess: async () => {
      setRevokingId(null);
      await queryClient.invalidateQueries({ queryKey: inviteHistoryQueryKey });
      pushToast({ title: "Invite revoked", tone: "success" });
    },
    onError: (error) => {
      setRevokingId(null);
      pushToast({
        title: "Failed to revoke invite",
        body: error instanceof Error ? error.message : "Unknown error",
        tone: "error",
      });
    },
  });

  if (!selectedCompanyId) {
    return <EmptyState icon={MailPlus} message="Select a company to view invites." />;
  }

  if (invitesQuery.isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (invitesQuery.error) {
    const message =
      invitesQuery.error instanceof ApiError && invitesQuery.error.status === 403
        ? "You do not have permission to manage company invites."
        : invitesQuery.error instanceof Error
          ? invitesQuery.error.message
          : "Failed to load invites.";
    return (
      <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
        <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-destructive">{message}</p>
        </div>
        {!(invitesQuery.error instanceof ApiError && invitesQuery.error.status === 403) ? (
          <Button size="sm" variant="ghost" className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0"
            disabled={invitesQuery.isRefetching}
            onClick={() => invitesQuery.refetch()}>
            {invitesQuery.isRefetching ? "Retrying\u2026" : "Retry"}
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <MailPlus className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          <h1 className="text-2xl font-semibold">Company Invites</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Create human invite links for company access. New invite links are copied to your clipboard when they are generated.
        </p>
      </div>

      <section className="space-y-4 rounded-xl border border-border p-5">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold">Create invite</h2>
          <p className="text-sm text-muted-foreground">
            Generate a human invite link and choose the default access it should request.
          </p>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Choose a role</legend>
          <div className="rounded-xl border border-border">
            {inviteRoleOptions.map((option, index) => {
              const checked = humanRole === option.value;
              return (
                <label
                  key={option.value}
                  className={`flex cursor-pointer gap-3 px-4 py-4 ${index > 0 ? "border-t border-border" : ""}`}
                >
                  <input
                    type="radio"
                    name="invite-role"
                    value={option.value}
                    checked={checked}
                    onChange={() => setHumanRole(option.value)}
                    className="mt-1 h-4 w-4 border-border text-foreground accent-[color:hsl(var(--primary))]"
                  />
                  <span className="min-w-0 space-y-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{option.label}</span>
                      {option.value === "operator" ? (
                        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                          Default
                        </span>
                      ) : null}
                    </span>
                    <span className="block max-w-2xl text-sm text-muted-foreground">{option.description}</span>
                    <span className="block text-sm text-foreground">{option.gets}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="rounded-lg border border-border px-4 py-3 text-sm text-muted-foreground">
          Each invite link is single-use. The first successful use consumes the link and creates or reuses the matching join request before approval.
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
            {createInviteMutation.isPending ? "Creating…" : "Create invite"}
          </Button>
          <span className="text-sm text-muted-foreground">Invite history below keeps the audit trail.</span>
        </div>

        {latestInviteUrl ? (
          <div className="space-y-3 rounded-lg border border-border px-4 py-4">
            <div className="space-y-1">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-medium">Latest invite link</div>
                <div aria-live="polite" aria-atomic="true" className="min-w-[52px]">
                  {latestInviteCopied ? (
                    <span className="flex items-center gap-1 text-xs text-green-600 motion-safe:animate-pulse">
                      <Check aria-hidden="true" className="h-3 w-3" />
                      Copied
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                This URL includes the current Paperclip domain returned by the server.
              </div>
            </div>
            <button
              type="button"
              aria-label="Copy invite URL"
              onClick={async () => {
                const copied = await copyInviteUrl(latestInviteUrl);
                setLatestInviteCopied(copied);
              }}
              className="w-full rounded-md border border-border bg-muted/60 px-3 py-2 text-left text-sm break-all transition-colors hover:bg-background cursor-copy"
            >
              {latestInviteUrl}
            </button>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" asChild>
                <a href={latestInviteUrl} target="_blank" rel="noreferrer noopener">
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Open invite
                  <span className="sr-only">(opens in new tab)</span>
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-border">
        <div className="flex flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">Invite history</h2>
            <p className="text-sm text-muted-foreground">
              Review invite status, role, inviter, and any linked join request.
            </p>
          </div>
          <Link to="/inbox/requests" className="text-sm underline underline-offset-4">
            Open join request queue
          </Link>
        </div>

        {inviteHistory.length === 0 ? (
          <div className="border-t border-border py-8">
            <EmptyState icon={MailPlus} message="No invites have been created yet." />
          </div>
        ) : (
          <div className="border-t border-border">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">State</th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Role</th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Invited by</th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Created</th>
                    <th scope="col" className="px-5 py-3 font-medium text-muted-foreground">Join request</th>
                    <th scope="col" className="px-5 py-3 text-right font-medium text-muted-foreground">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inviteHistory.map((invite) => (
                    <tr key={invite.id} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-3 align-top">
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${inviteStatePillClass(invite.state)}`}>
                          {formatInviteState(invite.state)}
                        </span>
                      </td>
                      <td className="px-5 py-3 align-top">{invite.humanRole ?? "—"}</td>
                      <td className="px-5 py-3 align-top">
                        <div>{invite.invitedByUser?.name || invite.invitedByUser?.email || "Unknown inviter"}</div>
                        {invite.invitedByUser?.email && invite.invitedByUser.name ? (
                          <div className="text-xs text-muted-foreground">{invite.invitedByUser.email}</div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3 align-top text-muted-foreground">
                        {new Date(invite.createdAt).toLocaleString()}
                      </td>
                      <td className="px-5 py-3 align-top">
                        {invite.relatedJoinRequestId ? (
                          <Link to="/inbox/requests" className="underline underline-offset-4">
                            Review request
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-right align-top">
                        {invite.state === "active" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            aria-label={`Revoke invite created ${new Date(invite.createdAt).toLocaleDateString()}`}
                            onClick={() => revokeMutation.mutate(invite.id)}
                            disabled={revokeMutation.isPending && revokingId === invite.id}
                          >
                            {revokeMutation.isPending && revokingId === invite.id ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                            {revokeMutation.isPending && revokingId === invite.id ? "Revoking\u2026" : "Revoke"}
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Inactive</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {invitesQuery.hasNextPage ? (
              <div className="flex justify-center border-t border-border px-5 py-4">
                <Button
                  type="button"
                  variant="outline"
                  aria-busy={invitesQuery.isFetchingNextPage}
                  onClick={() => invitesQuery.fetchNextPage()}
                  disabled={invitesQuery.isFetchingNextPage}
                >
                  {invitesQuery.isFetchingNextPage ? "Loading more…" : "View more"}
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}

function formatInviteState(state: "active" | "accepted" | "expired" | "revoked") {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function inviteStatePillClass(state: "active" | "accepted" | "expired" | "revoked") {
  switch (state) {
    case "active":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    case "accepted":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400";
    case "revoked":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "expired":
    default:
      return "border-border bg-muted/40 text-muted-foreground";
  }
}
