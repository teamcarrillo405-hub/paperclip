import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle, Clock, Mail, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToastActions } from "@/context/ToastContext";
import { integrationsApi, type EmailStatusResponse } from "@/api/integrations";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useNavigate } from "@/lib/router";

interface PostalStatus {
  provider: "postal" | "smtp" | "console";
  postalHost: string | null;
  postalConfigured: boolean;
  smtpHost: string | null;
  smtpConfigured: boolean;
  fromDomain: string | null;
  fromAddress: string;
}

interface EmailHistoryItem {
  id: string;
  to: string;
  subject: string;
  templateName: string | null;
  status: string;
  messageId: string | null;
  provider: string;
  createdAt: string;
}

const BRAND_PRIMARY = "#2563eb";
const BRAND_ACCENT = "#16a34a";

const TEMPLATE_CARDS: Array<{
  id: string;
  label: string;
  description: string;
  color: string;
}> = [
  { id: "welcome", label: "Welcome", description: "Onboard a new customer", color: "#2563eb" },
  { id: "invoice", label: "Invoice", description: "Payment receipt w/ line items", color: "#16a34a" },
  { id: "alert", label: "Alert", description: "Guardian / monitoring alert", color: "#f97316" },
  { id: "report", label: "Report", description: "Weekly business summary", color: "#7c3aed" },
  { id: "followup", label: "Follow-up", description: "Customer check-in with CTA", color: "#0ea5e9" },
];

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

export function EmailPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [testEmail, setTestEmail] = useState("");

  useEffect(() => {
    setBreadcrumbs([{ label: "Email" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const companyId = selectedCompanyId;

  const emailStatusQuery = useQuery<EmailStatusResponse>({
    queryKey: ["integrations", "email", "status", companyId],
    queryFn: () => integrationsApi.email.getStatus(companyId ?? ""),
    enabled: Boolean(companyId),
  });

  const statusQuery = useQuery<PostalStatus>({
    queryKey: ["postal", "status"],
    queryFn: () => apiJson<PostalStatus>("/api/postal/status"),
  });

  const historyQuery = useQuery<{ items: EmailHistoryItem[] }>({
    queryKey: ["postal", "history", companyId],
    queryFn: () =>
      apiJson<{ items: EmailHistoryItem[] }>(
        `/api/postal/history?companyId=${encodeURIComponent(companyId ?? "")}`,
      ),
    enabled: Boolean(companyId),
  });

  const testMutation = useMutation({
    mutationFn: async (to: string) =>
      apiJson<{ status: string; provider: string; messageId: string }>(
        "/api/postal/test",
        { method: "POST", body: JSON.stringify({ companyId, to }) },
      ),
    onSuccess: (result) => {
      pushToast({ title: `Test email sent via ${result.provider} (${result.status})`, tone: "success" });
      queryClient.invalidateQueries({ queryKey: ["postal", "history", companyId] });
    },
    onError: (err: Error) => pushToast({ title: err.message ?? "Failed to send test email", tone: "error" }),
  });

  const banner = useMemo(() => {
    if (!statusQuery.data) return null;
    const s = statusQuery.data;
    if (s.provider === "postal") {
      return {
        tone: "ok" as const,
        icon: CheckCircle,
        title: "Postal connected",
        text: `Sending via self-hosted Postal at ${s.postalHost ?? "(unknown host)"}`,
      };
    }
    if (s.provider === "smtp") {
      return {
        tone: "warn" as const,
        icon: AlertCircle,
        title: "SMTP fallback active",
        text: `Postal not configured — sending via SMTP at ${s.smtpHost ?? "(unknown host)"}`,
      };
    }
    return {
      tone: "warn" as const,
      icon: AlertCircle,
      title: "Development mode",
      text: "Neither Postal nor SMTP configured — emails will be logged to console only.",
    };
  }, [statusQuery.data]);

  const emailConnected =
    emailStatusQuery.data?.gmail.connected || emailStatusQuery.data?.outlook.connected;

  if (emailStatusQuery.isLoading) {
    return (
      <div className="p-6">
        <PageSkeleton variant="list" title="Email" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div
          className="flex items-center justify-center rounded-lg"
          style={{ width: 40, height: 40, background: BRAND_PRIMARY, color: "#fff" }}
        >
          <Mail size={20} />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
          <p className="text-sm text-muted-foreground">
            Transactional email powered by Postal, with SMTP and dev fallback.
          </p>
        </div>
      </div>

      {emailStatusQuery.isError && (
        <div role="alert" className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3">
          <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-destructive">
              {(emailStatusQuery.error as Error)?.message || "Failed to load email status."}
            </p>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive/70 hover:text-destructive h-auto px-1 py-0 text-xs shrink-0"
            disabled={emailStatusQuery.isFetching}
            onClick={() => void emailStatusQuery.refetch()}
          >
            {emailStatusQuery.isFetching ? "Retrying…" : "Retry"}
          </Button>
        </div>
      )}

      {!emailStatusQuery.isError && emailStatusQuery.data && !emailConnected && (
        <EmptyState
          icon={Mail}
          message="Connect Gmail or Outlook to manage emails from your agents."
          action="Connect email"
          onAction={() => navigate("/integrations")}
        />
      )}

      {emailConnected && (
        <>
          {banner ? (
            <Card>
              <CardContent
                className="flex items-start gap-3 py-4"
                style={{
                  borderLeft: `4px solid ${banner.tone === "ok" ? BRAND_ACCENT : "#f97316"}`,
                }}
              >
                <banner.icon
                  size={20}
                  style={{ color: banner.tone === "ok" ? BRAND_ACCENT : "#f97316", marginTop: 2 }}
                />
                <div>
                  <div className="font-medium">{banner.title}</div>
                  <div className="text-sm text-muted-foreground">{banner.text}</div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardContent className="py-4 space-y-3">
              <div className="font-medium flex items-center gap-2">
                <Send size={16} /> Send a test email
              </div>
              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <Label htmlFor="test-email">Recipient</Label>
                  <Input
                    id="test-email"
                    type="email"
                    placeholder="you@example.com"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </div>
                <Button
                  disabled={!testEmail || testMutation.isPending || !companyId}
                  onClick={() => testMutation.mutate(testEmail)}
                  style={{ background: BRAND_PRIMARY }}
                >
                  {testMutation.isPending ? "Sending…" : "Send test"}
                </Button>
              </div>
            </CardContent>
          </Card>

          <div>
            <div className="font-medium mb-3">Templates</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {TEMPLATE_CARDS.map((t) => (
                <Card key={t.id} className="overflow-hidden">
                  <div style={{ height: 64, background: t.color }} />
                  <CardContent className="py-3">
                    <div className="font-medium text-sm">{t.label}</div>
                    <div className="text-xs text-muted-foreground">{t.description}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="py-4">
              <div className="font-medium mb-2 flex items-center gap-2">
                <Clock size={16} /> Recent sends
              </div>
              {historyQuery.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : historyQuery.data && historyQuery.data.items.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground border-b">
                        <th className="py-2 pr-3">To</th>
                        <th className="py-2 pr-3">Subject</th>
                        <th className="py-2 pr-3">Template</th>
                        <th className="py-2 pr-3">Status</th>
                        <th className="py-2 pr-3">Provider</th>
                        <th className="py-2 pr-3">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyQuery.data.items.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">{row.to}</td>
                          <td className="py-2 pr-3">{row.subject}</td>
                          <td className="py-2 pr-3">
                            {row.templateName ? <Badge variant="secondary">{row.templateName}</Badge> : "—"}
                          </td>
                          <td className="py-2 pr-3">
                            <Badge
                              style={{
                                background: row.status === "sent" ? BRAND_ACCENT : "#dc2626",
                                color: "#fff",
                              }}
                            >
                              {row.status}
                            </Badge>
                          </td>
                          <td className="py-2 pr-3">{row.provider}</td>
                          <td className="py-2 pr-3">{new Date(row.createdAt).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No emails sent yet.</div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="py-4 space-y-2 text-sm">
              <div className="font-medium">Configuration</div>
              {statusQuery.data ? (
                <dl className="grid grid-cols-2 gap-1 text-xs">
                  <dt className="text-muted-foreground">Active provider</dt>
                  <dd>{statusQuery.data.provider}</dd>
                  <dt className="text-muted-foreground">Postal host</dt>
                  <dd>{statusQuery.data.postalHost ?? "—"}</dd>
                  <dt className="text-muted-foreground">SMTP host</dt>
                  <dd>{statusQuery.data.smtpHost ?? "—"}</dd>
                  <dt className="text-muted-foreground">From address</dt>
                  <dd>{statusQuery.data.fromAddress}</dd>
                  <dt className="text-muted-foreground">From domain</dt>
                  <dd>{statusQuery.data.fromDomain ?? "—"}</dd>
                </dl>
              ) : (
                <div className="text-muted-foreground">Loading…</div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default EmailPage;
