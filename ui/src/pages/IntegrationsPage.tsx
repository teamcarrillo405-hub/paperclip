import { ReactNode, useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Phone, Plug, Share2, Users } from "lucide-react";
import { useSearchParams } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToastActions } from "@/context/ToastContext";
import { cn } from "@/lib/utils";
import {
  integrationsApi,
  type EmailProviderKey,
  type EmailStatusResponse,
  type QuickBooksStatusResponse,
} from "@/api/integrations";

const queryKeys = {
  quickbooksStatus: (companyId: string) =>
    ["integrations", "quickbooks", "status", companyId] as const,
  emailStatus: (companyId: string) =>
    ["integrations", "email", "status", companyId] as const,
};

function QuickBooksIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill="#2CA01C" />
      <path
        fill="#fff"
        d="M13.5 19.5a7 7 0 0 0 0 14h3v-2.6h-3a4.4 4.4 0 1 1 0-8.8h1.9v15.2h2.6V19.5h-4.5Zm21 0h-1.9v15.2h-1.9a4.4 4.4 0 1 1 0-8.8h3v-2.6h-3a7 7 0 0 0 0 14h4.8V19.5Z"
      />
    </svg>
  );
}

function GmailIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="8" fill="#fff" />
      <path
        d="M8 14.5v20a2 2 0 0 0 2 2h4.5v-13L24 30l9.5-6.5v13H38a2 2 0 0 0 2-2v-20L24 25.5 8 14.5Z"
        fill="#EA4335"
      />
      <path d="M8 14.5 24 25.5l16-11V13a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v1.5Z" fill="#EA4335" opacity="0.85" />
    </svg>
  );
}

function OutlookIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <rect width="48" height="48" rx="8" fill="#0078D4" />
      <path
        fill="#fff"
        d="M15 16a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 3.5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm11.5-2.5h10A1.5 1.5 0 0 1 38 18.5v11a1.5 1.5 0 0 1-1.5 1.5h-10V17Zm1.5 1.8v9.4l4.5-3-4.5-2.2 4.5-2.2-4.5-2Z"
      />
    </svg>
  );
}

function TwilioIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <circle cx="24" cy="24" r="24" fill="#F22F46" opacity="0.85" />
      <circle cx="17" cy="17" r="4" fill="#fff" />
      <circle cx="31" cy="17" r="4" fill="#fff" />
      <circle cx="17" cy="31" r="4" fill="#fff" />
      <circle cx="31" cy="31" r="4" fill="#fff" />
    </svg>
  );
}

type StatusTone = "connected" | "disconnected" | "coming-soon";

function StatusBadge({ tone, label }: { tone: StatusTone; label: string }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "shrink-0",
        tone === "connected" && "border-transparent bg-green-600 text-white hover:bg-green-700",
        tone === "disconnected" && "border-transparent bg-muted text-muted-foreground",
        tone === "coming-soon" && "border-transparent bg-muted text-muted-foreground",
      )}
    >
      {label}
    </Badge>
  );
}

interface IntegrationCardProps {
  icon: ReactNode;
  name: string;
  description: string;
  statusTone: StatusTone;
  statusLabel: string;
  accountLabel?: string | null;
  action?: ReactNode;
  disabled?: boolean;
}

function IntegrationCard({
  icon,
  name,
  description,
  statusTone,
  statusLabel,
  accountLabel,
  action,
  disabled,
}: IntegrationCardProps) {
  return (
    <Card className={cn(disabled && "opacity-60")}>
      <CardContent className="flex h-full flex-col gap-4 p-5">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 shrink-0">{icon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-foreground truncate">{name}</span>
              <StatusBadge tone={statusTone} label={statusLabel} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            {accountLabel && (
              <p className="mt-2 text-xs text-muted-foreground truncate" title={accountLabel}>
                {accountLabel}
              </p>
            )}
          </div>
        </div>
        {action && <div className="mt-auto flex justify-end">{action}</div>}
      </CardContent>
    </Card>
  );
}

function connectRedirectUrl(payload: { url?: string; authorizationUrl?: string }): string | null {
  return payload.url ?? payload.authorizationUrl ?? null;
}

export function IntegrationsPage() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const handledRedirectRef = useRef(false);

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Settings" },
      { label: "Integrations" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const quickbooksStatusQuery = useQuery<QuickBooksStatusResponse>({
    queryKey: queryKeys.quickbooksStatus(selectedCompanyId ?? ""),
    queryFn: () => integrationsApi.quickbooks.getStatus(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  const emailStatusQuery = useQuery<EmailStatusResponse>({
    queryKey: queryKeys.emailStatus(selectedCompanyId ?? ""),
    queryFn: () => integrationsApi.email.getStatus(selectedCompanyId!),
    enabled: !!selectedCompanyId,
  });

  useEffect(() => {
    if (handledRedirectRef.current) return;
    const connected = searchParams.get("connected");
    const quickbooks = searchParams.get("quickbooks");
    const emailStatus = searchParams.get("email_status");
    const emailProvider = searchParams.get("email_provider");
    let matched = false;

    if (quickbooks === "connected" || connected === "quickbooks") {
      pushToast({ title: "QuickBooks connected successfully", tone: "success" });
      matched = true;
    }
    if (connected === "gmail" || (emailStatus === "connected" && emailProvider === "gmail")) {
      pushToast({ title: "Gmail connected successfully", tone: "success" });
      matched = true;
    }
    if (connected === "outlook" || (emailStatus === "connected" && emailProvider === "outlook")) {
      pushToast({ title: "Outlook connected successfully", tone: "success" });
      matched = true;
    }
    if (emailStatus === "error") {
      pushToast({
        title: "Email connection failed",
        body: emailProvider ? `Provider: ${emailProvider}` : undefined,
        tone: "error",
      });
      matched = true;
    }

    if (matched) {
      handledRedirectRef.current = true;
      const next = new URLSearchParams(searchParams);
      next.delete("connected");
      next.delete("quickbooks");
      next.delete("email_status");
      next.delete("email_provider");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, pushToast]);

  const connectQuickBooksMutation = useMutation({
    mutationFn: () => integrationsApi.quickbooks.getConnectUrl(selectedCompanyId!),
    onSuccess: (data) => {
      const target = connectRedirectUrl(data);
      if (!target) {
        pushToast({ title: "Failed to start QuickBooks connect", tone: "error" });
        return;
      }
      window.location.assign(target);
    },
    onError: (err: Error) => {
      pushToast({
        title: "Failed to start QuickBooks connect",
        body: err.message,
        tone: "error",
      });
    },
  });

  const disconnectQuickBooksMutation = useMutation({
    mutationFn: () => integrationsApi.quickbooks.disconnect(selectedCompanyId!),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.quickbooksStatus(selectedCompanyId ?? ""),
      });
      pushToast({ title: "QuickBooks disconnected", tone: "info" });
    },
    onError: (err: Error) => {
      pushToast({
        title: "Failed to disconnect QuickBooks",
        body: err.message,
        tone: "error",
      });
    },
  });

  const connectEmailMutation = useMutation({
    mutationFn: (provider: EmailProviderKey) =>
      integrationsApi.email.getConnectUrl(selectedCompanyId!, provider),
    onSuccess: (data) => {
      const target = connectRedirectUrl(data);
      if (!target) {
        pushToast({ title: "Failed to start email connect", tone: "error" });
        return;
      }
      window.location.assign(target);
    },
    onError: (err: Error) => {
      pushToast({
        title: "Failed to start email connect",
        body: err.message,
        tone: "error",
      });
    },
  });

  const disconnectEmailMutation = useMutation({
    mutationFn: (provider: EmailProviderKey) =>
      integrationsApi.email.disconnect(selectedCompanyId!, provider).then(() => provider),
    onSuccess: (provider) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.emailStatus(selectedCompanyId ?? ""),
      });
      pushToast({
        title: provider === "gmail" ? "Gmail disconnected" : "Outlook disconnected",
        tone: "info",
      });
    },
    onError: (err: Error) => {
      pushToast({
        title: "Failed to disconnect email provider",
        body: err.message,
        tone: "error",
      });
    },
  });

  if (!selectedCompany || !selectedCompanyId) {
    return (
      <div className="text-sm text-muted-foreground">
        No company selected. Select a company from the switcher above.
      </div>
    );
  }

  const quickbooksStatus = quickbooksStatusQuery.data;
  const emailStatus = emailStatusQuery.data;
  const quickbooksConnected = !!quickbooksStatus?.connected;
  const gmailConnected = !!emailStatus?.gmail.connected;
  const outlookConnected = !!emailStatus?.outlook.connected;

  const quickbooksAccountLabel = quickbooksStatus?.companyName
    ?? (quickbooksStatus?.realmId ? `Realm ${quickbooksStatus.realmId}` : null);

  return (
    <div className="max-w-5xl space-y-6">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Plug className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Integrations</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Connect your business tools to enable AI automation
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <IntegrationCard
          icon={<QuickBooksIcon className="h-10 w-10" />}
          name="QuickBooks Online"
          description="Sync invoices, customers, expenses and financial reports with your AI agents"
          statusTone={quickbooksConnected ? "connected" : "disconnected"}
          statusLabel={quickbooksConnected ? "Connected" : "Not Connected"}
          accountLabel={quickbooksConnected ? quickbooksAccountLabel : null}
          action={
            quickbooksConnected ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={disconnectQuickBooksMutation.isPending}
                onClick={() => disconnectQuickBooksMutation.mutate()}
              >
                {disconnectQuickBooksMutation.isPending ? "Disconnecting..." : "Disconnect"}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={connectQuickBooksMutation.isPending || quickbooksStatusQuery.isLoading}
                onClick={() => connectQuickBooksMutation.mutate()}
              >
                {connectQuickBooksMutation.isPending ? "Starting..." : "Connect"}
              </Button>
            )
          }
        />

        <IntegrationCard
          icon={<GmailIcon className="h-10 w-10" />}
          name="Gmail"
          description="Read, draft and send emails from your Gmail inbox"
          statusTone={gmailConnected ? "connected" : "disconnected"}
          statusLabel={gmailConnected ? "Connected" : "Not Connected"}
          accountLabel={gmailConnected ? emailStatus?.gmail.emailAddress ?? null : null}
          action={
            gmailConnected ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={
                  disconnectEmailMutation.isPending &&
                  disconnectEmailMutation.variables === "gmail"
                }
                onClick={() => disconnectEmailMutation.mutate("gmail")}
              >
                {disconnectEmailMutation.isPending &&
                disconnectEmailMutation.variables === "gmail"
                  ? "Disconnecting..."
                  : "Disconnect"}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={
                  emailStatusQuery.isLoading ||
                  (connectEmailMutation.isPending && connectEmailMutation.variables === "gmail")
                }
                onClick={() => connectEmailMutation.mutate("gmail")}
              >
                {connectEmailMutation.isPending && connectEmailMutation.variables === "gmail"
                  ? "Starting..."
                  : "Connect"}
              </Button>
            )
          }
        />

        <IntegrationCard
          icon={<OutlookIcon className="h-10 w-10" />}
          name="Microsoft Outlook"
          description="Read, draft and send emails via Microsoft 365"
          statusTone={outlookConnected ? "connected" : "disconnected"}
          statusLabel={outlookConnected ? "Connected" : "Not Connected"}
          accountLabel={outlookConnected ? emailStatus?.outlook.emailAddress ?? null : null}
          action={
            outlookConnected ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={
                  disconnectEmailMutation.isPending &&
                  disconnectEmailMutation.variables === "outlook"
                }
                onClick={() => disconnectEmailMutation.mutate("outlook")}
              >
                {disconnectEmailMutation.isPending &&
                disconnectEmailMutation.variables === "outlook"
                  ? "Disconnecting..."
                  : "Disconnect"}
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={
                  emailStatusQuery.isLoading ||
                  (connectEmailMutation.isPending && connectEmailMutation.variables === "outlook")
                }
                onClick={() => connectEmailMutation.mutate("outlook")}
              >
                {connectEmailMutation.isPending && connectEmailMutation.variables === "outlook"
                  ? "Starting..."
                  : "Connect"}
              </Button>
            )
          }
        />

        <IntegrationCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
              <Phone className="h-5 w-5" />
            </div>
          }
          name="Voice Agent"
          description="Answer calls 24/7 and make outbound AR reminder calls"
          statusTone="disconnected"
          statusLabel="Not Connected"
          action={
            <Button size="sm" disabled>
              Connect
            </Button>
          }
        />

        <IntegrationCard
          icon={<TwilioIcon className="h-10 w-10" />}
          name="Twilio SMS"
          description="Send automated SMS messages to customers"
          statusTone="coming-soon"
          statusLabel="Coming Soon"
          disabled
        />

        <IntegrationCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-pink-600 text-white">
              <Share2 className="h-5 w-5" />
            </div>
          }
          name="Social Media"
          description="Schedule posts to Instagram, LinkedIn, X, Reddit & Google Business"
          statusTone="disconnected"
          statusLabel="Not Connected"
          action={
            <Button size="sm" disabled>
              Connect
            </Button>
          }
        />

        <IntegrationCard
          icon={
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-purple-600 text-white">
              <Users className="h-5 w-5" />
            </div>
          }
          name="Twenty CRM"
          description="Open-source Salesforce alternative for customer relationship management"
          statusTone="disconnected"
          statusLabel="Optional Sync"
          action={
            <Button size="sm" variant="outline" disabled>
              Configure via env
            </Button>
          }
        />
      </div>
    </div>
  );
}
