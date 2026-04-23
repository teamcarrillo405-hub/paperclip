import type { CustomerMemoryEntry, CustomerRecord } from "./types.js";

/**
 * In-process fallback store. Used by the plugin worker when the host DB is
 * unreachable, and by unit tests.
 */
export class InMemoryCustomerStore {
  private readonly rows = new Map<string, CustomerRecord>();

  list(companyId: string, filter?: string, limit?: number): CustomerRecord[] {
    const needle = filter?.toLowerCase();
    let items = Array.from(this.rows.values()).filter((row) => row.companyId === companyId);
    if (needle) {
      items = items.filter((row) =>
        [row.name, row.email ?? "", row.phone ?? "", row.notes ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }
    items.sort((a, b) => {
      const aTime = a.lastInteractionAt ? Date.parse(a.lastInteractionAt) : 0;
      const bTime = b.lastInteractionAt ? Date.parse(b.lastInteractionAt) : 0;
      return bTime - aTime;
    });
    return typeof limit === "number" ? items.slice(0, limit) : items;
  }

  search(companyId: string, query: string): CustomerRecord[] {
    return this.list(companyId, query);
  }

  find(companyId: string, identifier: string): CustomerRecord | undefined {
    const needle = identifier.toLowerCase();
    for (const row of this.rows.values()) {
      if (row.companyId !== companyId) continue;
      if (
        row.id === identifier ||
        row.customerId === identifier ||
        (row.email && row.email.toLowerCase() === needle) ||
        (row.phone && row.phone === identifier)
      ) {
        return row;
      }
    }
    return undefined;
  }

  upsert(record: CustomerRecord): CustomerRecord {
    this.rows.set(record.id, record);
    return record;
  }

  appendMemory(
    companyId: string,
    customerId: string,
    entry: CustomerMemoryEntry,
  ): CustomerRecord | undefined {
    const row = this.rows.get(customerId);
    if (!row || row.companyId !== companyId) return undefined;
    const next: CustomerRecord = {
      ...row,
      memories: [...row.memories, entry],
      lastInteractionAt: entry.date,
      updatedAt: new Date().toISOString(),
    };
    this.rows.set(customerId, next);
    return next;
  }

  topByValue(companyId: string, limit: number): CustomerRecord[] {
    return Array.from(this.rows.values())
      .filter((r) => r.companyId === companyId)
      .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
      .slice(0, limit);
  }

  atRisk(companyId: string, sentimentThreshold = 0.3, silenceDays = 60): CustomerRecord[] {
    const cutoff = Date.now() - silenceDays * 86_400_000;
    return Array.from(this.rows.values()).filter((r) => {
      if (r.companyId !== companyId) return false;
      if (r.sentimentScore !== null && r.sentimentScore < sentimentThreshold) return true;
      if (r.lastInteractionAt && Date.parse(r.lastInteractionAt) < cutoff) return true;
      return false;
    });
  }
}
