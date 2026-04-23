import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { BILLING_PLANS, billingApi, type SubscriptionStatus } from "../api/billing";

interface SubscriptionBadgeProps {
  companyId: string | null;
  className?: string;
}

function daysUntil(dateIso: string | null): number | null {
  if (!dateIso) return null;
  const diffMs = new Date(dateIso).getTime() - Date.now();
  if (Number.isNaN(diffMs)) return null;
  return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
}

export function SubscriptionBadge({ companyId, className }: SubscriptionBadgeProps) {
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    billingApi
      .status(companyId)
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load billing status");
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  if (!companyId || error || !status || status.status === "none") {
    return null;
  }

  const planName = status.planId ? BILLING_PLANS[status.planId].name : "No plan";

  if (status.status === "past_due" || status.status === "incomplete") {
    return (
      <Badge variant="destructive" className={className}>
        {planName} · Past Due
      </Badge>
    );
  }

  if (status.status === "canceled") {
    return (
      <Badge variant="outline" className={className}>
        {planName} · Canceled
      </Badge>
    );
  }

  if (status.status === "trialing") {
    const days = daysUntil(status.trialEndsAt);
    const trialLabel = days === null ? "Trial" : `Trial ends in ${days} day${days === 1 ? "" : "s"}`;
    return (
      <Badge variant="secondary" className={className}>
        {planName} · {trialLabel}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary" className={className}>
      {planName} · Active
    </Badge>
  );
}
