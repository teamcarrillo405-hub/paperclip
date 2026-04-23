export type BillingPlanId = "starter" | "growth" | "scale";

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  maxAgents: number;
  maxCompanies: number;
  price: number;
  description: string;
}

export const BILLING_PLANS: Record<BillingPlanId, BillingPlan> = {
  starter: {
    id: "starter",
    name: "Starter",
    maxAgents: 5,
    maxCompanies: 1,
    price: 149,
    description: "Perfect for small businesses getting started with AI agents",
  },
  growth: {
    id: "growth",
    name: "Growth",
    maxAgents: 15,
    maxCompanies: 3,
    price: 399,
    description: "For growing businesses running multiple AI teams",
  },
  scale: {
    id: "scale",
    name: "Scale",
    maxAgents: 50,
    maxCompanies: 10,
    price: 999,
    description: "For operators running a portfolio of AI businesses",
  },
};

export const BILLING_PLAN_IDS: BillingPlanId[] = ["starter", "growth", "scale"];

export const TRIAL_DAYS = 14;

export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return typeof value === "string" && (value === "starter" || value === "growth" || value === "scale");
}

export function getPlanPriceEnvKey(planId: BillingPlanId): string {
  switch (planId) {
    case "starter":
      return "STRIPE_STARTER_PRICE_ID";
    case "growth":
      return "STRIPE_GROWTH_PRICE_ID";
    case "scale":
      return "STRIPE_SCALE_PRICE_ID";
  }
}
