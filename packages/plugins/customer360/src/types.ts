/**
 * Customer 360 plugin types.
 *
 * The canonical store is the local `customer_memories` table. When a Twenty
 * CRM deployment is configured, writes are mirrored there on a best-effort
 * basis and reads may be enriched with Twenty data.
 */

export interface CustomerMemoryEntry {
  type: "note" | "interaction" | "system";
  summary: string;
  date: string;
  createdAt: string;
  channel?: string;
}

export interface CustomerRecord {
  id: string;
  companyId: string;
  customerId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  company?: string | null;
  notes?: string | null;
  memories: CustomerMemoryEntry[];
  sentimentScore: number | null;
  lifetimeValue: number;
  lastInteractionAt: string | null;
  createdAt: string;
  updatedAt: string;
  twentyId?: string | null;
}

export interface CreateCustomerInput {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
}

export interface UpdateCustomerInput {
  name?: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
  sentimentScore?: number;
  lifetimeValue?: number;
}

export interface AddInteractionInput {
  type: string;
  summary: string;
  date?: string;
}

export interface TwentyConfig {
  internalUrl: string;
  apiKey: string | null;
}
