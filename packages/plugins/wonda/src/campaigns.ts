import type { WondaAssetRef, WondaPlatform } from "./types.js";

export type CampaignStatus =
  | "draft"
  | "generating"
  | "ready"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed";

export interface CampaignRecord {
  id: string;
  companyId: string;
  name: string;
  topic?: string;
  platforms: WondaPlatform[];
  status: CampaignStatus;
  assets: WondaAssetRef[];
  scheduledAt?: string;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignPublishResult {
  posted: Array<{ platform: WondaPlatform; url?: string; id?: string }>;
  errors: Array<{ platform: WondaPlatform; message: string }>;
}

export interface CampaignStore {
  list(companyId: string): Promise<CampaignRecord[]>;
  get(companyId: string, id: string): Promise<CampaignRecord | null>;
  create(input: Omit<CampaignRecord, "id" | "createdAt" | "updatedAt">): Promise<CampaignRecord>;
  update(
    companyId: string,
    id: string,
    patch: Partial<Omit<CampaignRecord, "id" | "companyId" | "createdAt">>,
  ): Promise<CampaignRecord>;
}

/**
 * In-memory store used for unit tests and as a fallback when no DB-backed
 * store is wired in. Production callers pass a store backed by the
 * `marketing_campaigns` drizzle table.
 */
export class InMemoryCampaignStore implements CampaignStore {
  private readonly rows = new Map<string, CampaignRecord>();
  private counter = 0;

  async list(companyId: string): Promise<CampaignRecord[]> {
    return Array.from(this.rows.values())
      .filter((r) => r.companyId === companyId)
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  async get(companyId: string, id: string): Promise<CampaignRecord | null> {
    const row = this.rows.get(id);
    if (!row || row.companyId !== companyId) return null;
    return row;
  }

  async create(
    input: Omit<CampaignRecord, "id" | "createdAt" | "updatedAt">,
  ): Promise<CampaignRecord> {
    this.counter += 1;
    const now = new Date().toISOString();
    const record: CampaignRecord = {
      ...input,
      id: `camp-${this.counter}-${now}`,
      createdAt: now,
      updatedAt: now,
    };
    this.rows.set(record.id, record);
    return record;
  }

  async update(
    companyId: string,
    id: string,
    patch: Partial<Omit<CampaignRecord, "id" | "companyId" | "createdAt">>,
  ): Promise<CampaignRecord> {
    const existing = this.rows.get(id);
    if (!existing || existing.companyId !== companyId) {
      throw new Error(`campaign ${id} not found for company ${companyId}`);
    }
    const updated: CampaignRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      companyId: existing.companyId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(id, updated);
    return updated;
  }
}
