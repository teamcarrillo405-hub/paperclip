/**
 * Twenty CRM REST client.
 *
 * The Twenty integration is optional. When TWENTY_INTERNAL_URL or
 * TWENTY_API_KEY are not configured, every method resolves to a null/empty
 * result so the calling service can treat Twenty as an optional sync target
 * rather than a hard dependency.
 *
 * @see https://twenty.com/developers/section/api-and-webhooks
 */

import type { TwentyConfig } from "./types.js";

export interface TwentyPerson {
  id: string;
  name?: { firstName?: string; lastName?: string };
  emails?: { primaryEmail?: string };
  phones?: { primaryPhoneNumber?: string };
  jobTitle?: string | null;
  city?: string | null;
}

export interface TwentyUpsertInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

export function loadTwentyConfig(): TwentyConfig {
  return {
    internalUrl: process.env.TWENTY_INTERNAL_URL ?? "",
    apiKey: process.env.TWENTY_API_KEY && process.env.TWENTY_API_KEY.length > 0
      ? process.env.TWENTY_API_KEY
      : null,
  };
}

export function isTwentyConfigured(config: TwentyConfig = loadTwentyConfig()): boolean {
  return config.internalUrl.length > 0 && config.apiKey !== null;
}

export class TwentyClient {
  private readonly baseUrl: string | null;
  private readonly apiKey: string | null;

  constructor(config: TwentyConfig = loadTwentyConfig()) {
    this.baseUrl = config.internalUrl.length > 0 ? config.internalUrl.replace(/\/$/, "") : null;
    this.apiKey = config.apiKey;
  }

  get enabled(): boolean {
    return this.baseUrl !== null && this.apiKey !== null;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T | null> {
    if (!this.enabled) return null;
    try {
      const res = await fetch(`${this.baseUrl}/rest${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (!res.ok) return null;
      if (res.status === 204) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  async findPersonByEmail(email: string): Promise<TwentyPerson | null> {
    const path = `/people?filter=emails.primaryEmail[eq]:${encodeURIComponent(email)}&limit=1`;
    const res = await this.request<{ data?: { people?: TwentyPerson[] } }>("GET", path);
    return res?.data?.people?.[0] ?? null;
  }

  async createPerson(input: TwentyUpsertInput): Promise<TwentyPerson | null> {
    const [firstName, ...rest] = input.name.trim().split(/\s+/);
    const lastName = rest.join(" ");
    const body = {
      name: { firstName: firstName ?? input.name, lastName: lastName || "" },
      emails: input.email ? { primaryEmail: input.email } : undefined,
      phones: input.phone ? { primaryPhoneNumber: input.phone } : undefined,
      jobTitle: input.company ?? undefined,
    };
    const res = await this.request<{ data?: { createPerson?: TwentyPerson } }>(
      "POST",
      "/people",
      body,
    );
    return res?.data?.createPerson ?? null;
  }

  async updatePerson(
    twentyId: string,
    patch: Partial<TwentyUpsertInput>,
  ): Promise<TwentyPerson | null> {
    const body: Record<string, unknown> = {};
    if (patch.name !== undefined) {
      const [firstName, ...rest] = patch.name.trim().split(/\s+/);
      body.name = { firstName: firstName ?? patch.name, lastName: rest.join(" ") };
    }
    if (patch.email !== undefined) {
      body.emails = { primaryEmail: patch.email };
    }
    if (patch.phone !== undefined) {
      body.phones = { primaryPhoneNumber: patch.phone };
    }
    if (patch.company !== undefined) {
      body.jobTitle = patch.company;
    }
    const res = await this.request<{ data?: { updatePerson?: TwentyPerson } }>(
      "PATCH",
      `/people/${encodeURIComponent(twentyId)}`,
      body,
    );
    return res?.data?.updatePerson ?? null;
  }
}

export function createTwentyClient(): TwentyClient {
  return new TwentyClient(loadTwentyConfig());
}
