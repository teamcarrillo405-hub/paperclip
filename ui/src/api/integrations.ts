/**
 * @fileoverview Frontend API client for the integrations OAuth surface.
 *
 * Maps 1:1 to the routes in `server/src/routes/integrations.ts`.
 */

import { api } from "./client";

export type EmailProviderKey = "gmail" | "outlook";

export interface QuickBooksConnectResponse {
  authorizationUrl: string;
  url?: string;
}

export interface QuickBooksStatusResponse {
  connected: boolean;
  realmId?: string;
  companyName?: string;
  expiresAt?: string;
  refreshTokenExpiresAt?: string;
  scope?: string;
  updatedAt?: string;
}

export interface EmailConnectResponse {
  url: string;
  authorizationUrl: string;
  state: string;
}

export interface EmailProviderStatus {
  connected: boolean;
  emailAddress: string | null;
}

export interface EmailStatusResponse {
  gmail: EmailProviderStatus;
  outlook: EmailProviderStatus;
}

function withCompany(path: string, companyId: string, extra?: Record<string, string>): string {
  const params = new URLSearchParams({ companyId });
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  }
  return `${path}?${params.toString()}`;
}

export const integrationsApi = {
  quickbooks: {
    getConnectUrl: (companyId: string) =>
      api.get<QuickBooksConnectResponse>(withCompany("/integrations/quickbooks/connect", companyId)),
    getStatus: (companyId: string) =>
      api.get<QuickBooksStatusResponse>(withCompany("/integrations/quickbooks/status", companyId)),
    disconnect: (companyId: string) =>
      api.delete<{ ok: boolean }>(withCompany("/integrations/quickbooks/disconnect", companyId)),
  },
  email: {
    getConnectUrl: (companyId: string, provider: EmailProviderKey) =>
      api.get<EmailConnectResponse>(withCompany("/integrations/email/connect", companyId, { provider })),
    getStatus: (companyId: string) =>
      api.get<EmailStatusResponse>(withCompany("/integrations/email/status", companyId)),
    disconnect: (companyId: string, provider: EmailProviderKey) =>
      api.delete<{ ok: boolean }>(withCompany("/integrations/email/disconnect", companyId, { provider })),
  },
};
