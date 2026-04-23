import { api } from "./client";

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

export interface SubscriptionStatus {
  companyId: string;
  planId: BillingPlanId | null;
  status: string;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
}

export const billingApi = {
  checkout: (companyId: string, data: { planId: BillingPlanId; successUrl: string; cancelUrl: string }) =>
    api.post<{ url: string }>(`/billing/${companyId}/checkout`, data),
  portal: (companyId: string, data: { returnUrl: string }) =>
    api.post<{ url: string }>(`/billing/${companyId}/portal`, data),
  status: (companyId: string) => api.get<SubscriptionStatus>(`/billing/${companyId}/status`),
};
