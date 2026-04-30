import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Handshake,
  Copy,
  Check,
  DollarSign,
  Users,
  TrendingUp,
  LineChart,
  ExternalLink,
  Plus,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { resellerApi, type ResellerPartner } from "../api/reseller";
import { ApiError } from "../api/client";
import { PageSkeleton } from "../components/PageSkeleton";
import { useBreadcrumbs } from "../context/BreadcrumbContext";

function formatCurrencyCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const CLIENT_COUNT_OPTIONS = ["1-5", "6-20", "21-50", "50+"] as const;

function PartnerApplyForm({ onApplied }: { onApplied: (onboardingUrl: string) => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [clientCount, setClientCount] = useState<string>(CLIENT_COUNT_OPTIONS[0]);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      resellerApi.apply({
        name,
        email,
        company: company || undefined,
        clientCount: parseClientCount(clientCount),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["reseller", "me"] });
      onApplied(res.onboardingUrl);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to apply");
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Apply to the Partner Program</CardTitle>
        <CardDescription>
          We'll set up a Stripe Connect account for you and share your referral link.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            mutation.mutate();
          }}
        >
          <div className="grid gap-2">
            <Label htmlFor="partner-name">Your name</Label>
            <Input id="partner-name" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="partner-email">Email</Label>
            <Input
              id="partner-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="partner-company">Company name</Label>
            <Input
              id="partner-company"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Optional"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="partner-client-count">How many clients could you refer?</Label>
            <Select value={clientCount} onValueChange={setClientCount}>
              <SelectTrigger id="partner-client-count">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_COUNT_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? "Creating…" : "Apply"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function parseClientCount(bucket: string): number | undefined {
  switch (bucket) {
    case "1-5":
      return 3;
    case "6-20":
      return 12;
    case "21-50":
      return 30;
    case "50+":
      return 75;
    default:
      return undefined;
  }
}

function NonPartnerView() {
  const [onboardingUrl, setOnboardingUrl] = useState<string | null>(null);

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-6">
      <header className="text-center">
        <div className="flex justify-center">
          <Handshake className="h-10 w-10 text-primary" />
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">Earn 20% recurring commission</h1>
        <p className="mt-2 text-muted-foreground">
          Refer clients to Avero AI and earn 20% of every monthly subscription for as
          long as they stay.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <DollarSign className="h-6 w-6 text-primary" />
            <CardTitle className="mt-2 text-lg">20% Monthly Commission</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Recurring payouts via Stripe Connect on every subscription you bring in.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <LineChart className="h-6 w-6 text-primary" />
            <CardTitle className="mt-2 text-lg">Real-time Dashboard</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Track clients, MRR, and earnings in one place — powered by Stripe Express.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Palette className="h-6 w-6 text-primary" />
            <CardTitle className="mt-2 text-lg">White-label Ready</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Logo kit and marketing collateral to help you sell Avero under your brand.
          </CardContent>
        </Card>
      </div>

      {onboardingUrl ? (
        <Card>
          <CardHeader>
            <CardTitle>You're in — finish your Stripe setup</CardTitle>
            <CardDescription>
              Complete onboarding so we can pay out your commissions automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href={onboardingUrl} target="_blank" rel="noreferrer">
                Complete Stripe Setup
                <ExternalLink className="ml-2 h-4 w-4" />
              </a>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <PartnerApplyForm onApplied={setOnboardingUrl} />
      )}
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function AddClientDialog() {
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => resellerApi.addClient(companyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reseller"] });
      setCompanyId("");
      setOpen(false);
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : "Failed to add client");
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-2 h-4 w-4" />
        Add Client
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Attach a client</DialogTitle>
          <DialogDescription>
            Paste the company UUID of the Avero account you referred. New signups using
            your referral link are attached automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="add-client-company-id">Company ID</Label>
          <Input
            id="add-client-company-id"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              setError(null);
              mutation.mutate();
            }}
            disabled={!companyId || mutation.isPending}
          >
            {mutation.isPending ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PartnerDashboard({ partner }: { partner: ResellerPartner }) {
  const metricsQuery = useQuery({
    queryKey: ["reseller", "metrics"],
    queryFn: () => resellerApi.metrics(),
  });
  const clientsQuery = useQuery({
    queryKey: ["reseller", "clients"],
    queryFn: () => resellerApi.clients(),
  });
  const referralQuery = useQuery({
    queryKey: ["reseller", "referral-link"],
    queryFn: () => resellerApi.referralLink(),
  });

  const openDashboard = async () => {
    const { url } = await resellerApi.dashboardLink();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const openOnboarding = async () => {
    const { url } = await resellerApi.onboardingLink();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const metrics = metricsQuery.data;
  const clients = clientsQuery.data?.clients ?? [];
  const referral = referralQuery.data;
  const isActive = partner.stripeConnectStatus === "active";

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Partner Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Welcome back, {partner.name}. Commission rate: {partner.commissionPercent}%.
          </p>
        </div>
        <div className="flex gap-2">
          {!isActive ? (
            <Button variant="outline" onClick={openOnboarding}>
              Finish Stripe Setup
              <ExternalLink className="ml-2 h-4 w-4" />
            </Button>
          ) : null}
          <Button variant="outline" onClick={openDashboard}>
            Open Stripe Dashboard
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </header>

      {!isActive ? (
        <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="flex items-center justify-between gap-4 py-4">
            <div className="text-sm">
              Your Stripe Connect account isn't active yet ({partner.stripeConnectStatus}).
              Commissions can't be paid until onboarding is complete.
            </div>
            <Button size="sm" onClick={openOnboarding}>
              Finish setup
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard
          icon={<Users className="h-5 w-5 text-muted-foreground" />}
          label="Total Clients"
          value={String(metrics?.totalClientCount ?? 0)}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5 text-muted-foreground" />}
          label="Monthly Recurring Revenue"
          value={formatCurrencyCents(metrics?.monthlyRecurringRevenueCents ?? 0)}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
          label="Commissions This Month"
          value={formatCurrencyCents(metrics?.commissionsThisMonthCents ?? 0)}
        />
        <StatCard
          icon={<DollarSign className="h-5 w-5 text-muted-foreground" />}
          label="All-time Earnings"
          value={formatCurrencyCents(metrics?.allTimeEarningsCents ?? 0)}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Your referral link</CardTitle>
            <CardDescription>
              Share this URL — new signups are attached to your account automatically.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded border bg-muted px-3 py-2 text-sm">
              {referral?.url ?? "Loading…"}
            </code>
            {referral ? <CopyButton value={referral.url} /> : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between">
          <div>
            <CardTitle>Clients</CardTitle>
            <CardDescription>{clients.length} total</CardDescription>
          </div>
          <AddClientDialog />
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {clients.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No clients yet. Share your referral link above to get started.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b">
                  <th className="py-2 pr-4">Client</th>
                  <th className="py-2 pr-4">Plan</th>
                  <th className="py-2 pr-4">Monthly</th>
                  <th className="py-2 pr-4">Your Commission</th>
                  <th className="py-2 pr-4">Joined</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-medium">{client.companyName}</td>
                    <td className="py-2 pr-4 capitalize">{client.planId ?? "—"}</td>
                    <td className="py-2 pr-4">{formatCurrencyCents(client.mrrCents)}</td>
                    <td className="py-2 pr-4">
                      {formatCurrencyCents(client.commissionCents)}
                      <span className="ml-1 text-xs text-muted-foreground">
                        ({client.commissionPercent}%)
                      </span>
                    </td>
                    <td className="py-2 pr-4">{formatDate(client.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>White-label assets</CardTitle>
          <CardDescription>
            Logos, badges, and marketing copy you can use when selling Avero AI.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" asChild>
            <a href="/branding/" target="_blank" rel="noreferrer">
              Open logo kit
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 py-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon}
          {label}
        </div>
        <div className="text-2xl font-semibold tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

export function PartnerPortal() {
  const { setBreadcrumbs } = useBreadcrumbs();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["reseller", "me"],
    queryFn: () => resellerApi.me(),
  });

  useEffect(() => {
    setBreadcrumbs([{ label: "Partner Program" }]);
  }, [setBreadcrumbs]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("onboarded") === "1" || params.get("refresh") === "1") {
      refetch();
    }
  }, [refetch]);

  if (isLoading) {
    return <PageSkeleton />;
  }
  if (isError) {
    return (
      <div className="p-6 text-sm text-red-600">Failed to load partner data.</div>
    );
  }

  return data?.partner ? <PartnerDashboard partner={data.partner} /> : <NonPartnerView />;
}

export default PartnerPortal;
