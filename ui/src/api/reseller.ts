import { api } from "./client";

export interface ResellerPartner {
  id: string;
  name: string;
  email: string;
  company: string | null;
  partnerCode: string;
  stripeConnectStatus: string;
  commissionPercent: number;
}

export interface ResellerMetrics {
  totalClientCount: number;
  monthlyRecurringRevenueCents: number;
  commissionsThisMonthCents: number;
  allTimeEarningsCents: number;
  commissionPercent: number;
  stripeConnectStatus: string;
  partnerCode: string;
}

export interface ResellerClientRow {
  id: string;
  companyId: string;
  companyName: string;
  planId: "starter" | "growth" | "scale" | null;
  mrrCents: number;
  commissionCents: number;
  commissionPercent: number;
  joinedAt: string;
  activeAt: string | null;
  stripeSubscriptionId: string | null;
}

export interface ResellerApplyInput {
  name: string;
  email: string;
  company?: string;
  clientCount?: number;
}

export interface ResellerApplyResponse {
  resellerId: string;
  partnerCode: string;
  stripeAccountId: string;
  onboardingUrl: string;
}

export const resellerApi = {
  me: () => api.get<{ partner: ResellerPartner | null }>("/reseller/me"),
  apply: (input: ResellerApplyInput) =>
    api.post<ResellerApplyResponse>("/reseller/apply", input),
  metrics: () => api.get<ResellerMetrics>("/reseller/metrics"),
  clients: () => api.get<{ clients: ResellerClientRow[] }>("/reseller/clients"),
  addClient: (companyId: string) =>
    api.post<{ ok: true }>("/reseller/clients", { companyId }),
  referralLink: () =>
    api.get<{ url: string; partnerCode: string }>("/reseller/referral-link"),
  onboardingLink: () => api.get<{ url: string }>("/reseller/onboarding-link"),
  dashboardLink: () => api.get<{ url: string }>("/reseller/dashboard-link"),
};
