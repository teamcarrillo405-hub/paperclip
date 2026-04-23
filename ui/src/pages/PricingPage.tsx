import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BILLING_PLANS, billingApi, type BillingPlanId } from "../api/billing";
import { useCompany } from "../context/CompanyContext";

const PLAN_ORDER: BillingPlanId[] = ["starter", "growth", "scale"];

function featuresFor(planId: BillingPlanId): string[] {
  const plan = BILLING_PLANS[planId];
  const lines = [
    `Up to ${plan.maxAgents} agents`,
    `Up to ${plan.maxCompanies} ${plan.maxCompanies === 1 ? "company" : "companies"}`,
    "Unlimited issues and projects",
    "Activity log and audit trail",
    "Board-level access controls",
  ];
  if (planId === "growth" || planId === "scale") {
    lines.push("Priority email support");
  }
  if (planId === "scale") {
    lines.push("Dedicated onboarding session");
    lines.push("Custom SSO");
  }
  return lines;
}

export function PricingPage() {
  const { selectedCompanyId } = useCompany();
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout(planId: BillingPlanId) {
    if (!selectedCompanyId) {
      setError("Select a company before starting a subscription.");
      return;
    }
    setError(null);
    setLoadingPlan(planId);
    try {
      const { url } = await billingApi.checkout(selectedCompanyId, {
        planId,
        successUrl: `${window.location.origin}/company/settings?billing=success`,
        cancelUrl: `${window.location.origin}/pricing?billing=canceled`,
      });
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start checkout.");
      setLoadingPlan(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-12">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Simple, per-company pricing</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Every plan starts with a 14-day free trial. No credit card required to start — billed monthly,
          cancel anytime.
        </p>
      </div>

      {error ? (
        <div className="mx-auto mt-6 max-w-2xl rounded-md border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      ) : null}

      <div className="mt-10 grid gap-6 md:grid-cols-3">
        {PLAN_ORDER.map((planId) => {
          const plan = BILLING_PLANS[planId];
          const isFeatured = planId === "growth";
          return (
            <Card
              key={plan.id}
              className={isFeatured ? "border-primary ring-1 ring-primary/50" : undefined}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  {isFeatured ? <Badge>Most popular</Badge> : null}
                </div>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold">${plan.price}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </div>
                <p className="text-xs text-muted-foreground">14-day free trial included</p>
              </CardHeader>
              <CardContent className="space-y-2">
                <ul className="space-y-2 text-sm">
                  {featuresFor(plan.id).map((feature) => (
                    <li key={feature} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 text-primary" aria-hidden />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button
                  className="w-full"
                  variant={isFeatured ? "default" : "outline"}
                  disabled={loadingPlan !== null}
                  onClick={() => startCheckout(plan.id)}
                >
                  {loadingPlan === plan.id ? "Redirecting…" : "Start free trial"}
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>

      <p className="mt-8 text-center text-xs text-muted-foreground">
        Monthly billing · Cancel anytime · Prices in USD
      </p>
    </div>
  );
}
