/**
 * CustomerService — orchestrates reads/writes across the local memory store
 * and Twenty CRM.
 *
 * The local memory store is always authoritative. Twenty is consulted and
 * mirrored on a best-effort basis and is skipped entirely when not configured.
 */

import { InMemoryCustomerStore } from "./memory-store.js";
import { TwentyClient } from "./twenty-client.js";
import type {
  AddInteractionInput,
  CreateCustomerInput,
  CustomerMemoryEntry,
  CustomerRecord,
  UpdateCustomerInput,
} from "./types.js";

function randomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cust_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface CustomerServiceOptions {
  companyId: string;
  store?: InMemoryCustomerStore;
  twenty?: TwentyClient;
}

export class CustomerService {
  private readonly companyId: string;
  private readonly store: InMemoryCustomerStore;
  private readonly twenty: TwentyClient;

  constructor(opts: CustomerServiceOptions) {
    this.companyId = opts.companyId;
    this.store = opts.store ?? new InMemoryCustomerStore();
    this.twenty = opts.twenty ?? new TwentyClient();
  }

  async getCustomer(identifier: string): Promise<CustomerRecord | null> {
    const local = this.store.find(this.companyId, identifier);
    if (local) return local;
    if (this.twenty.enabled && identifier.includes("@")) {
      const person = await this.twenty.findPersonByEmail(identifier);
      if (person) {
        return this.hydrateFromTwenty(person);
      }
    }
    return null;
  }

  async createCustomer(input: CreateCustomerInput): Promise<CustomerRecord> {
    const record: CustomerRecord = {
      id: randomId(),
      companyId: this.companyId,
      customerId: null,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      company: input.company ?? null,
      notes: input.notes ?? null,
      memories: [],
      sentimentScore: null,
      lifetimeValue: 0,
      lastInteractionAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      twentyId: null,
    };
    if (this.twenty.enabled) {
      const person = await this.twenty.createPerson(input);
      if (person) record.twentyId = person.id;
    }
    return this.store.upsert(record);
  }

  async updateCustomer(id: string, fields: UpdateCustomerInput): Promise<CustomerRecord | null> {
    const existing = this.store.find(this.companyId, id);
    if (!existing) return null;
    const merged: CustomerRecord = {
      ...existing,
      ...fields,
      email: fields.email ?? existing.email,
      phone: fields.phone ?? existing.phone,
      company: fields.company ?? existing.company,
      notes: fields.notes ?? existing.notes,
      sentimentScore: fields.sentimentScore ?? existing.sentimentScore,
      lifetimeValue: fields.lifetimeValue ?? existing.lifetimeValue,
      updatedAt: nowIso(),
    };
    if (this.twenty.enabled && existing.twentyId) {
      await this.twenty.updatePerson(existing.twentyId, fields);
    }
    return this.store.upsert(merged);
  }

  async addNote(customerId: string, note: string): Promise<CustomerRecord | null> {
    return this.addMemory(customerId, { type: "note", summary: note, date: nowIso() });
  }

  async addInteraction(customerId: string, input: AddInteractionInput): Promise<CustomerRecord | null> {
    return this.addMemory(customerId, {
      type: "interaction",
      summary: input.summary,
      date: input.date ?? nowIso(),
      channel: input.type,
    });
  }

  async getCustomerTimeline(customerId: string): Promise<CustomerMemoryEntry[]> {
    const row = this.store.find(this.companyId, customerId);
    if (!row) return [];
    return [...row.memories].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }

  async getCustomerSentiment(customerId: string): Promise<{ score: number | null; label: string }> {
    const row = this.store.find(this.companyId, customerId);
    if (!row) return { score: null, label: "unknown" };
    const score = row.sentimentScore;
    if (score === null) return { score: null, label: "unknown" };
    if (score >= 0.7) return { score, label: "good" };
    if (score >= 0.4) return { score, label: "neutral" };
    return { score, label: "at-risk" };
  }

  async listCustomers(filter?: string, limit?: number): Promise<CustomerRecord[]> {
    return this.store.list(this.companyId, filter, limit);
  }

  async searchCustomers(query: string): Promise<CustomerRecord[]> {
    return this.store.search(this.companyId, query);
  }

  async getCustomerValue(customerId: string): Promise<{ lifetimeValue: number; lastInteractionAt: string | null } | null> {
    const row = this.store.find(this.companyId, customerId);
    if (!row) return null;
    return { lifetimeValue: row.lifetimeValue, lastInteractionAt: row.lastInteractionAt };
  }

  async getAtRiskCustomers(): Promise<CustomerRecord[]> {
    return this.store.atRisk(this.companyId);
  }

  async getTopCustomers(limit = 10): Promise<CustomerRecord[]> {
    return this.store.topByValue(this.companyId, limit);
  }

  private addMemory(customerId: string, entry: Omit<CustomerMemoryEntry, "createdAt">): CustomerRecord | null {
    const full: CustomerMemoryEntry = { ...entry, createdAt: nowIso() };
    return this.store.appendMemory(this.companyId, customerId, full) ?? null;
  }

  private hydrateFromTwenty(person: { id: string; name?: { firstName?: string; lastName?: string }; emails?: { primaryEmail?: string }; phones?: { primaryPhoneNumber?: string } }): CustomerRecord {
    const displayName = [person.name?.firstName, person.name?.lastName].filter(Boolean).join(" ").trim() || "Unknown";
    const record: CustomerRecord = {
      id: randomId(),
      companyId: this.companyId,
      customerId: null,
      name: displayName,
      email: person.emails?.primaryEmail ?? null,
      phone: person.phones?.primaryPhoneNumber ?? null,
      company: null,
      notes: null,
      memories: [],
      sentimentScore: null,
      lifetimeValue: 0,
      lastInteractionAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      twentyId: person.id,
    };
    return this.store.upsert(record);
  }
}
