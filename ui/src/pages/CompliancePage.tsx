import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Download, Lock, AlertTriangle } from "lucide-react";
import {
  complianceApi,
  type AuditEntry,
  type AuditLogFilters,
  type AuditOutcome,
  type AuditRiskLevel,
  type GuardrailConfig,
  type RetentionPolicy,
} from "../api/compliance";
import { agentsApi } from "../api/agents";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EmptyState } from "../components/EmptyState";

const RISK_TONES: Record<AuditRiskLevel, string> = {
  low: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-800",
};

const OUTCOME_TONES: Record<AuditOutcome, string> = {
  success: "bg-green-100 text-green-800",
  failure: "bg-red-100 text-red-800",
  blocked: "bg-orange-100 text-orange-800",
};

function Badge({ tone, children }: { tone: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${tone}`}>
      {children}
    </span>
  );
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
}

export function CompliancePage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  useEffect(() => {
    setBreadcrumbs([{ label: "Compliance" }]);
  }, [setBreadcrumbs]);

  const [tab, setTab] = useState("audit");

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={ShieldCheck}
          message="Select a company to view compliance settings."
        />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-5 w-5" />
        <h1 className="text-xl font-semibold">Compliance</h1>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList variant="line" className="justify-start">
          <TabsTrigger value="audit">Audit Log</TabsTrigger>
          <TabsTrigger value="privacy">Data Privacy</TabsTrigger>
          <TabsTrigger value="guardrails">Guardrails</TabsTrigger>
        </TabsList>
        <TabsContent value="audit" className="mt-4 space-y-4">
          <AuditLogTab companyId={selectedCompanyId} />
        </TabsContent>
        <TabsContent value="privacy" className="mt-4 space-y-4">
          <DataPrivacyTab companyId={selectedCompanyId} />
        </TabsContent>
        <TabsContent value="guardrails" className="mt-4 space-y-4">
          <GuardrailsTab companyId={selectedCompanyId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AuditLogTab({ companyId }: { companyId: string }) {
  const [filters, setFilters] = useState<AuditLogFilters>({ limit: 100 });
  const { data: agents } = useQuery({
    queryKey: ["compliance", "agents", companyId],
    queryFn: () => agentsApi.list(companyId),
  });
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["compliance", "audit", companyId, filters],
    queryFn: () => complianceApi.listAudit(companyId, filters),
  });

  const entries: AuditEntry[] = data?.entries ?? [];
  const agentNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents ?? []) m.set(a.id, a.name);
    return m;
  }, [agents]);

  function setFilter<K extends keyof AuditLogFilters>(key: K, value: AuditLogFilters[K]) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label htmlFor="from">From</Label>
            <Input
              id="from"
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => setFilter("from", e.target.value || undefined)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="to">To</Label>
            <Input
              id="to"
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => setFilter("to", e.target.value || undefined)}
            />
          </div>
          <div className="flex flex-col gap-1 min-w-[180px]">
            <Label>Agent</Label>
            <Select
              value={filters.agentId ?? "__all__"}
              onValueChange={(v) => setFilter("agentId", v === "__all__" ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All agents</SelectItem>
                {(agents ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <Label>Risk</Label>
            <Select
              value={filters.riskLevel ?? "__all__"}
              onValueChange={(v) =>
                setFilter("riskLevel", v === "__all__" ? undefined : (v as AuditRiskLevel))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All risks" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All risks</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
                <SelectItem value="critical">Critical</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 min-w-[140px]">
            <Label>Outcome</Label>
            <Select
              value={filters.outcome ?? "__all__"}
              onValueChange={(v) =>
                setFilter("outcome", v === "__all__" ? undefined : (v as AuditOutcome))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="All outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All outcomes</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failure">Failure</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => refetch()}>Apply</Button>
          <div className="ml-auto flex gap-2">
            <a href={complianceApi.auditExportUrl(companyId, "json")} download>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-1" /> JSON
              </Button>
            </a>
            <a href={complianceApi.auditExportUrl(companyId, "csv")} download>
              <Button variant="outline">
                <Download className="h-4 w-4 mr-1" /> CSV
              </Button>
            </a>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit Entries</CardTitle>
          <CardDescription>
            Append-only log of agent and user actions. Results limited to {filters.limit ?? 100}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="text-sm text-muted-foreground">No entries match the filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Timestamp</th>
                    <th className="py-2 pr-3 font-medium">Agent</th>
                    <th className="py-2 pr-3 font-medium">Action</th>
                    <th className="py-2 pr-3 font-medium">Resource</th>
                    <th className="py-2 pr-3 font-medium">Outcome</th>
                    <th className="py-2 pr-3 font-medium">Risk</th>
                    <th className="py-2 pr-3 font-medium">PII</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((e) => (
                    <tr key={e.id} className="border-b last:border-none">
                      <td className="py-2 pr-3 whitespace-nowrap">{formatTs(e.timestamp)}</td>
                      <td className="py-2 pr-3">
                        {e.agentId ? agentNameById.get(e.agentId) ?? e.agentId.slice(0, 8) : "—"}
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.action}</td>
                      <td className="py-2 pr-3 font-mono text-xs">{e.resource}</td>
                      <td className="py-2 pr-3">
                        <Badge tone={OUTCOME_TONES[e.outcome]}>{e.outcome}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge tone={RISK_TONES[e.riskLevel]}>{e.riskLevel}</Badge>
                      </td>
                      <td className="py-2 pr-3">
                        {e.piiDetected ? <Lock className="h-4 w-4 text-amber-600" /> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                setFilter("limit", (filters.limit ?? 100) + 100);
              }}
            >
              Load more
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

const RETENTION_OPTIONS = [30, 60, 90, 180, 365];

function DataPrivacyTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data: retention } = useQuery({
    queryKey: ["compliance", "retention", companyId],
    queryFn: () => complianceApi.getRetention(companyId),
  });
  const { data: summary } = useQuery({
    queryKey: ["compliance", "data-summary", companyId],
    queryFn: () => complianceApi.dataSummary(companyId),
  });
  const [days, setDays] = useState<number>(365);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteText, setDeleteText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (retention?.policy.auditLogDays) setDays(retention.policy.auditLogDays);
  }, [retention]);

  async function save() {
    setSaving(true);
    try {
      await complianceApi.updateRetention(companyId, { auditLogDays: days });
      qc.invalidateQueries({ queryKey: ["compliance", "retention", companyId] });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await complianceApi.deleteData(companyId, "DELETE");
      setDeleteOpen(false);
      setDeleteText("");
      qc.invalidateQueries({ queryKey: ["compliance", "data-summary", companyId] });
    } finally {
      setDeleting(false);
    }
  }

  const policy: RetentionPolicy | undefined = retention?.policy;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Retention Policy</CardTitle>
          <CardDescription>How long activity and audit logs are kept.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 min-w-[240px]">
            <Label>Keep activity and audit logs for</Label>
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RETENTION_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {policy ? (
            <div className="text-xs text-muted-foreground ml-auto">
              Current: audit {policy.auditLogDays ?? "∞"}d · activity {policy.activityDays ?? "∞"}d · runs{" "}
              {policy.runLogDays ?? "∞"}d · billing {policy.billingDays ?? "∞ (kept)"}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your Data</CardTitle>
          <CardDescription>
            Avero AI stores your agent activity logs, billing records, and integration credentials.
            Billing records are kept indefinitely.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary ? (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <div className="text-muted-foreground">Audit entries</div>
                <div className="text-lg font-semibold">{summary.summary.auditEntries}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Activity entries</div>
                <div className="text-lg font-semibold">{summary.summary.activityEntries}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Runs</div>
                <div className="text-lg font-semibold">{summary.summary.runs}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Loading…</div>
          )}
        </CardContent>
      </Card>

      <Card className="border-red-300">
        <CardHeader>
          <CardTitle className="text-red-700 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> GDPR Erasure
          </CardTitle>
          <CardDescription>
            Permanently delete activity, audit, and run logs for this company.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
            Request Data Deletion
          </Button>
        </CardContent>
      </Card>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete company data</DialogTitle>
            <DialogDescription>
              This will delete all audit, activity, and run log data for this company. This cannot
              be undone. Type <strong>DELETE</strong> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={deleteText}
            onChange={(e) => setDeleteText(e.target.value)}
            placeholder="DELETE"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={deleteText !== "DELETE" || deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Deleting…" : "Confirm deletion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GuardrailsTab({ companyId }: { companyId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["compliance", "guardrails", companyId],
    queryFn: () => complianceApi.getGuardrails(companyId),
  });
  const { data: triggersRes } = useQuery({
    queryKey: ["compliance", "guardrail-triggers", companyId],
    queryFn: () => complianceApi.guardrailTriggers(companyId),
  });

  const [local, setLocal] = useState<GuardrailConfig | null>(null);
  const [requireApprovalCalls, setRequireApprovalCalls] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data?.config) setLocal(data.config);
  }, [data]);

  async function save() {
    if (!local) return;
    setSaving(true);
    try {
      await complianceApi.updateGuardrails(companyId, local);
      qc.invalidateQueries({ queryKey: ["compliance", "guardrails", companyId] });
    } finally {
      setSaving(false);
    }
  }

  if (!local) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  const triggers = triggersRes?.triggers ?? [];

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Guardrails</CardTitle>
          <CardDescription>Policies enforced on agent actions.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Require approval for bulk emails</div>
              <div className="text-xs text-muted-foreground">
                When more than <em>{local.bulkOpThreshold}</em> recipients are targeted.
              </div>
            </div>
            <ToggleSwitch
              checked={local.bulkOpThreshold <= 10}
              onCheckedChange={(v) =>
                setLocal({ ...local, bulkOpThreshold: v ? 10 : 1000 })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Block agents from modifying billing</div>
              <div className="text-xs text-muted-foreground">
                Any billing mutation is denied without explicit human approval.
              </div>
            </div>
            <ToggleSwitch
              checked={local.blockBillingMutations}
              onCheckedChange={(v) => setLocal({ ...local, blockBillingMutations: v })}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="font-medium">Flag large-dollar mentions</div>
              <div className="text-xs text-muted-foreground mb-2">
                Actions mentioning amounts at or above this threshold require approval.
              </div>
              <Input
                type="number"
                value={local.highValueThreshold}
                onChange={(e) =>
                  setLocal({ ...local, highValueThreshold: Number(e.target.value) || 0 })
                }
                className="max-w-[160px]"
              />
            </div>
            <ToggleSwitch
              checked={local.highValueMentionsRequireApproval}
              onCheckedChange={(v) =>
                setLocal({ ...local, highValueMentionsRequireApproval: v })
              }
            />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Require approval for outbound calls</div>
              <div className="text-xs text-muted-foreground">
                Voice calls initiated by agents require a human to approve first.
              </div>
            </div>
            <ToggleSwitch
              checked={requireApprovalCalls}
              onCheckedChange={setRequireApprovalCalls}
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent Guardrail Triggers</CardTitle>
          <CardDescription>Last 10 blocked actions.</CardDescription>
        </CardHeader>
        <CardContent>
          {triggers.length === 0 ? (
            <div className="text-sm text-muted-foreground">No triggers recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3 font-medium">Timestamp</th>
                  <th className="py-2 pr-3 font-medium">Rule</th>
                  <th className="py-2 pr-3 font-medium">Attempted</th>
                  <th className="py-2 pr-3 font-medium">Resource</th>
                  <th className="py-2 pr-3 font-medium">Reason</th>
                </tr>
              </thead>
              <tbody>
                {triggers.slice(0, 10).map((t) => (
                  <tr key={t.id} className="border-b last:border-none">
                    <td className="py-2 pr-3 whitespace-nowrap">{formatTs(t.timestamp)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{String(t.rule)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{String(t.attemptedAction)}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{t.resource}</td>
                    <td className="py-2 pr-3 text-xs">{String(t.reason)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
