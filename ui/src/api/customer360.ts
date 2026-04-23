/**
 * @fileoverview Frontend API client for the Customer 360 routes.
 */

import { api } from "./client";

export type CustomerSentimentLabel = "good" | "neutral" | "at-risk" | "unknown";

export interface CustomerMemoryEntry {
  type: "note" | "interaction" | "system";
  summary: string;
  date: string;
  createdAt: string;
  channel?: string;
}

export interface Customer {
  id: string;
  companyId: string;
  customerId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  memories: CustomerMemoryEntry[];
  sentimentScore: number | null;
  sentimentLabel: CustomerSentimentLabel;
  lifetimeValue: number;
  lastInteractionAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerDetail extends Customer {
  timeline: CustomerMemoryEntry[];
}

export interface CreateCustomerInput {
  companyId: string;
  name: string;
  email?: string;
  phone?: string;
  lifetimeValue?: number;
}

export interface UpdateCustomerInput {
  companyId: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  sentimentScore?: number;
  lifetimeValue?: number;
}

export interface AddInteractionInput {
  companyId: string;
  type: "note" | "interaction" | "system";
  summary: string;
  date?: string;
  channel?: string;
}

function withCompany(path: string, companyId: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ companyId });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  }
  return `${path}?${params.toString()}`;
}

export const customer360Api = {
  list: (companyId: string) => api.get<Customer[]>(withCompany("/customers", companyId)),
  search: (companyId: string, q: string) =>
    api.get<Customer[]>(withCompany("/customers/search", companyId, { q })),
  atRisk: (companyId: string) =>
    api.get<Customer[]>(withCompany("/customers/at-risk", companyId)),
  top: (companyId: string, limit = 10) =>
    api.get<Customer[]>(withCompany("/customers/top", companyId, { limit: String(limit) })),
  get: (companyId: string, id: string) =>
    api.get<CustomerDetail>(withCompany(`/customers/${id}`, companyId)),
  create: (body: CreateCustomerInput) => api.post<Customer>("/customers", body),
  update: (id: string, body: UpdateCustomerInput) => api.put<Customer>(`/customers/${id}`, body),
  addInteraction: (id: string, body: AddInteractionInput) =>
    api.post<Customer>(`/customers/${id}/interactions`, body),
};
