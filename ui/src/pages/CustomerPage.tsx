import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Clock, Mail, Phone, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/EmptyState";
import { PageSkeleton } from "@/components/PageSkeleton";
import { useCompany } from "@/context/CompanyContext";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import { useToastActions } from "@/context/ToastContext";
import {
  customer360Api,
  type Customer,
  type CustomerDetail,
  type CustomerMemoryEntry,
  type CustomerSentimentLabel,
} from "@/api/customer360";

const queryKeys = {
  list: (companyId: string) => ["customers", companyId, "list"] as const,
  atRisk: (companyId: string) => ["customers", companyId, "at-risk"] as const,
  search: (companyId: string, q: string) => ["customers", companyId, "search", q] as const,
  detail: (companyId: string, id: string) => ["customers", companyId, "detail", id] as const,
};

function formatCurrency(value: number): string {
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function sentimentEmoji(label: CustomerSentimentLabel): string {
  switch (label) {
    case "good":
      return "😊";
    case "neutral":
      return "😐";
    case "at-risk":
      return "😟";
    default:
      return "·";
  }
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const handle = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(handle);
  }, [value, delayMs]);
  return debounced;
}

interface CustomerListRowProps {
  customer: Customer;
  selected: boolean;
  onSelect: (c: Customer) => void;
}

function CustomerListRow({ customer, selected, onSelect }: CustomerListRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(customer)}
      className={`w-full text-left p-3 border-b border-border hover:bg-accent/50 transition-colors ${
        selected ? "bg-accent" : ""
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm text-foreground truncate">{customer.name}</span>
            <span className="text-base leading-none" aria-label={customer.sentimentLabel}>
              {sentimentEmoji(customer.sentimentLabel)}
            </span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground truncate">
            {customer.email ?? customer.phone ?? "No contact info"}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Last interaction: {formatDate(customer.lastInteractionAt)}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-sm font-semibold">{formatCurrency(customer.lifetimeValue)}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">LTV</div>
        </div>
      </div>
    </button>
  );
}

interface TimelineProps {
  entries: CustomerMemoryEntry[];
}

function Timeline({ entries }: TimelineProps) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">No interactions recorded yet.</p>
    );
  }
  return (
    <ol className="space-y-3">
      {entries.map((entry, idx) => (
        <li key={`${entry.date}-${idx}`} className="flex gap-3">
          <div className="mt-1 h-2 w-2 shrink-0 bg-muted-foreground/50" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] uppercase">
                {entry.type}
              </Badge>
              {entry.channel && (
                <span className="text-[11px] text-muted-foreground">{entry.channel}</span>
              )}
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(entry.date)}
              </span>
            </div>
            <p className="mt-1 text-sm text-foreground whitespace-pre-wrap">{entry.summary}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

interface DetailPanelProps {
  companyId: string;
  customerId: string;
}

function DetailPanel({ companyId, customerId }: DetailPanelProps) {
  const queryClient = useQueryClient();
  const { pushToast } = useToastActions();
  const { data, isLoading } = useQuery<CustomerDetail>({
    queryKey: queryKeys.detail(companyId, customerId),
    queryFn: () => customer360Api.get(companyId, customerId),
  });
  const [noteDraft, setNoteDraft] = useState("");

  const addNote = useMutation({
    mutationFn: (note: string) =>
      customer360Api.addInteraction(customerId, {
        companyId,
        type: "note",
        summary: note,
      }),
    onSuccess: () => {
      setNoteDraft("");
      queryClient.invalidateQueries({ queryKey: queryKeys.detail(companyId, customerId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.list(companyId) });
      pushToast({ title: "Note added", tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to add note", body: err.message, tone: "error" });
    },
  });

  if (isLoading || !data) {
    return <PageSkeleton variant="detail" />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold truncate">{data.name}</h2>
              <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                {data.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {data.email}
                  </span>
                )}
                {data.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {data.phone}
                  </span>
                )}
              </div>
            </div>
            <span className="text-2xl" aria-label={data.sentimentLabel}>
              {sentimentEmoji(data.sentimentLabel)}
            </span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Lifetime Value</div>
            <div className="mt-1 text-xl font-semibold">{formatCurrency(data.lifetimeValue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Last Interaction</div>
            <div className="mt-1 text-sm font-medium">{formatDate(data.lastInteractionAt)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Add Note</h3>
          <Textarea
            value={noteDraft}
            onChange={(e) => setNoteDraft(e.target.value)}
            placeholder="Write a note about this customer..."
            rows={3}
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              disabled={noteDraft.trim().length === 0 || addNote.isPending}
              onClick={() => addNote.mutate(noteDraft.trim())}
            >
              {addNote.isPending ? "Saving..." : "Save Note"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-semibold mb-3">Timeline</h3>
          <Timeline entries={data.timeline} />
        </CardContent>
      </Card>
    </div>
  );
}

interface CreateCustomerFormProps {
  companyId: string;
  onCreated: (customer: Customer) => void;
}

function CreateCustomerForm({ companyId, onCreated }: CreateCustomerFormProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const { pushToast } = useToastActions();
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: () =>
      customer360Api.create({
        companyId,
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      }),
    onSuccess: (created) => {
      setOpen(false);
      setName("");
      setEmail("");
      setPhone("");
      queryClient.invalidateQueries({ queryKey: queryKeys.list(companyId) });
      onCreated(created);
      pushToast({ title: `Created ${created.name}`, tone: "success" });
    },
    onError: (err: Error) => {
      pushToast({ title: "Failed to create customer", body: err.message, tone: "error" });
    },
  });

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="h-3.5 w-3.5 mr-1.5" />
        New Customer
      </Button>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={name.trim().length === 0 || createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            {createMutation.isPending ? "Creating..." : "Create"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CustomerPage() {
  const { selectedCompany, selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounced(search, 250);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"all" | "at-risk">("all");

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? "Company", href: "/dashboard" },
      { label: "Customers" },
    ]);
  }, [setBreadcrumbs, selectedCompany?.name]);

  const listQuery = useQuery({
    queryKey: queryKeys.list(selectedCompanyId ?? ""),
    queryFn: () => customer360Api.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && debouncedSearch.length === 0 && tab === "all",
  });

  const searchQuery = useQuery({
    queryKey: queryKeys.search(selectedCompanyId ?? "", debouncedSearch),
    queryFn: () => customer360Api.search(selectedCompanyId!, debouncedSearch),
    enabled: !!selectedCompanyId && debouncedSearch.length > 0,
  });

  const atRiskQuery = useQuery({
    queryKey: queryKeys.atRisk(selectedCompanyId ?? ""),
    queryFn: () => customer360Api.atRisk(selectedCompanyId!),
    enabled: !!selectedCompanyId && tab === "at-risk",
  });

  const customers: Customer[] = useMemo(() => {
    if (debouncedSearch.length > 0) return searchQuery.data ?? [];
    if (tab === "at-risk") return atRiskQuery.data ?? [];
    return listQuery.data ?? [];
  }, [debouncedSearch, tab, searchQuery.data, atRiskQuery.data, listQuery.data]);

  const isLoading =
    (tab === "all" && debouncedSearch.length === 0 && listQuery.isLoading) ||
    (debouncedSearch.length > 0 && searchQuery.isLoading) ||
    (tab === "at-risk" && atRiskQuery.isLoading);

  if (!selectedCompanyId) {
    return <EmptyState icon={Users} message="Select a company to view customers." />;
  }

  return (
    <div className="flex gap-4 h-full">
      <div className="w-[380px] flex flex-col gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-lg font-semibold">Customers</h1>
        </div>

        <Input
          placeholder="Search name, email, phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <CreateCustomerForm companyId={selectedCompanyId} onCreated={(c) => setSelectedId(c.id)} />

        <Tabs value={tab} onValueChange={(v) => setTab(v as "all" | "at-risk")}>
          <TabsList className="w-full">
            <TabsTrigger value="all" className="flex-1">
              All
            </TabsTrigger>
            <TabsTrigger value="at-risk" className="flex-1">
              <AlertTriangle className="h-3.5 w-3.5 mr-1.5" />
              At Risk
            </TabsTrigger>
          </TabsList>
          <TabsContent value="all" className="mt-2">
            <div className="border border-border">
              {isLoading && (
                <div className="p-4 text-sm text-muted-foreground">Loading customers...</div>
              )}
              {!isLoading && customers.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  {debouncedSearch.length > 0 ? "No matches." : "No customers yet."}
                </div>
              )}
              {customers.map((customer) => (
                <CustomerListRow
                  key={customer.id}
                  customer={customer}
                  selected={customer.id === selectedId}
                  onSelect={(c) => setSelectedId(c.id)}
                />
              ))}
            </div>
          </TabsContent>
          <TabsContent value="at-risk" className="mt-2">
            <div className="border border-border">
              {isLoading && (
                <div className="p-4 text-sm text-muted-foreground">Loading at-risk customers...</div>
              )}
              {!isLoading && customers.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  No at-risk customers. 🎉
                </div>
              )}
              {customers.map((customer) => (
                <CustomerListRow
                  key={customer.id}
                  customer={customer}
                  selected={customer.id === selectedId}
                  onSelect={(c) => setSelectedId(c.id)}
                />
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <div className="flex-1 min-w-0">
        {selectedId ? (
          <DetailPanel companyId={selectedCompanyId} customerId={selectedId} />
        ) : (
          <EmptyState icon={Users} message="Select a customer to view details." />
        )}
      </div>
    </div>
  );
}
