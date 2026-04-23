import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Receipt,
  PiggyBank,
  ArrowRight,
} from "lucide-react";
import { Link } from "@/lib/router";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { financialApi, type FinancialSummary } from "../api/financial";
import { ApiError } from "../api/client";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { PageSkeleton } from "../components/PageSkeleton";
import { EmptyState } from "../components/EmptyState";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(amount);
}

function scoreColorClass(score: number): { ring: string; text: string; label: string } {
  if (score >= 80) return { ring: "text-emerald-500", text: "text-emerald-600", label: "bg-emerald-100 text-emerald-800" };
  if (score >= 50) return { ring: "text-amber-500", text: "text-amber-600", label: "bg-amber-100 text-amber-800" };
  return { ring: "text-red-500", text: "text-red-600", label: "bg-red-100 text-red-800" };
}

function HealthScoreCircle({ score, label }: { score: number; label: string }) {
  const colors = scoreColorClass(score);
  const radius = 56;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-6">
      <div className="relative h-36 w-36">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 128 128">
          <circle
            cx="64"
            cy="64"
            r={radius}
            strokeWidth="10"
            className="fill-none stroke-muted"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`fill-none transition-all duration-500 ${colors.ring}`}
            stroke="currentColor"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl font-bold tabular-nums ${colors.text}`}>{score}</span>
          <span className="text-xs text-muted-foreground">out of 100</span>
        </div>
      </div>
      <div>
        <div className="text-sm text-muted-foreground">Financial Health</div>
        <div className={`mt-1 inline-flex items-center rounded-full px-3 py-1 text-sm font-medium ${colors.label}`}>
          {label}
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof DollarSign;
  label: string;
  value: string;
  tone?: "positive" | "negative" | "neutral";
}) {
  const toneClass = tone === "positive" ? "text-emerald-600" : tone === "negative" ? "text-red-600" : "text-foreground";
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Icon className="h-4 w-4" />
          {label}
        </div>
        <div className={`mt-2 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function NotConnectedPrompt() {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="rounded-full bg-primary/10 p-4">
          <DollarSign className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">Connect QuickBooks to unlock Financial Health</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Link your QuickBooks Online account to see your health score, revenue, expenses, and AI-powered insights.
          </p>
        </div>
        <Button asChild>
          <Link to="/company/settings">
            Connect QuickBooks
            <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SummaryView({ summary, onRefresh, refreshing }: {
  summary: FinancialSummary;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const netTone = summary.netIncome >= 0 ? "positive" : "negative";
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <HealthScoreCircle score={summary.healthScore} label={summary.healthLabel} />
            <div className="flex-1 min-w-[260px]">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Headline</div>
              <p className="mt-1 text-xl font-semibold leading-snug">{summary.headline}</p>
              <div className="mt-2 text-xs text-muted-foreground">Period: {summary.period}</div>
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={refreshing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard icon={TrendingUp} label="Revenue" value={formatCurrency(summary.revenue)} tone="neutral" />
        <MetricCard icon={Receipt} label="Expenses" value={formatCurrency(summary.expenses)} tone="neutral" />
        <MetricCard icon={PiggyBank} label="Net Income" value={formatCurrency(summary.netIncome)} tone={netTone} />
        <MetricCard icon={DollarSign} label="Outstanding A/R" value={formatCurrency(summary.outstandingAR)} tone="neutral" />
      </div>

      {summary.alerts.length > 0 ? (
        <Card className="border-red-200 bg-red-50/40 dark:border-red-900/40 dark:bg-red-950/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-red-700 dark:text-red-400">
              <AlertTriangle className="h-5 w-5" />
              Alerts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {summary.alerts.map((alert, idx) => (
                <li
                  key={idx}
                  className="rounded-md border border-red-200 bg-white p-3 text-sm dark:border-red-900/40 dark:bg-red-950/30"
                >
                  {alert}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Insights</CardTitle>
          <CardDescription>What the numbers tell us this period.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {summary.insights.map((insight, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                <span>{insight}</span>
              </li>
            ))}
            {summary.insights.length === 0 ? (
              <li className="text-sm text-muted-foreground">No insights yet.</li>
            ) : null}
          </ul>
        </CardContent>
      </Card>

      {summary.recommendations.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommendations</CardTitle>
            <CardDescription>Concrete next actions — ask an agent to take them on.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {summary.recommendations.map((rec, idx) => (
                <div
                  key={idx}
                  className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-card p-4"
                >
                  <p className="text-sm">{rec}</p>
                  <Button asChild size="sm" variant="outline" className="self-start">
                    <Link to="/agents/all">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Ask Agent
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

export function FinancialHealthPage() {
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const queryClient = useQueryClient();

  useEffect(() => {
    setBreadcrumbs([{ label: "Financial Health" }]);
  }, [setBreadcrumbs]);

  const summaryQuery = useQuery({
    queryKey: ["financial", "summary", selectedCompanyId, "current"],
    queryFn: () => financialApi.summary(selectedCompanyId!, "current"),
    enabled: !!selectedCompanyId,
    retry: (failureCount, err) => {
      if (err instanceof ApiError && err.status === 409) return false;
      return failureCount < 2;
    },
  });

  const refreshMutation = useMutation({
    mutationFn: () => financialApi.refresh(selectedCompanyId!, "current"),
    onSuccess: (data) => {
      queryClient.setQueryData(["financial", "summary", selectedCompanyId, "current"], data);
    },
  });

  if (!selectedCompanyId) {
    return (
      <div className="p-6">
        <EmptyState
          icon={DollarSign}
          message="Select a company to view its financial health."
        />
      </div>
    );
  }

  if (summaryQuery.isLoading) {
    return <PageSkeleton variant="dashboard" />;
  }

  const qbNotConnected =
    summaryQuery.error instanceof ApiError && summaryQuery.error.status === 409;

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Financial Health</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            AI-powered bookkeeping snapshot — your revenue, expenses, and what to do about them.
          </p>
        </div>
      </div>

      {qbNotConnected ? (
        <NotConnectedPrompt />
      ) : summaryQuery.error || !summaryQuery.data ? (
        <EmptyState
          icon={DollarSign}
          message={
            summaryQuery.error instanceof Error
              ? `Failed to load financial summary: ${summaryQuery.error.message}`
              : "Failed to load financial summary."
          }
        />
      ) : (
        <SummaryView
          summary={summaryQuery.data}
          onRefresh={() => refreshMutation.mutate()}
          refreshing={refreshMutation.isPending}
        />
      )}
    </div>
  );
}
