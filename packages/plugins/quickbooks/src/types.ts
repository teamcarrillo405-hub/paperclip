/**
 * QuickBooks Online entity types and internal plugin shapes.
 *
 * Only the fields we actively read or surface are typed; QuickBooks responses
 * contain many more fields which we pass through as `Record<string, unknown>`
 * where relevant.
 */

/** Stored per-company OAuth token in the plugin state store. */
export interface QuickBooksToken {
  accessToken: string;
  refreshToken: string;
  /** QuickBooks "realm" ID — the company identifier on Intuit's side. */
  realmId: string;
  /** ISO 8601 timestamp — absolute expiry for the access token. */
  expiresAt: string;
  /** ISO 8601 timestamp — absolute expiry for the refresh token (x_refresh_token_expires_in). */
  refreshTokenExpiresAt?: string;
  /** Scope granted by the user. */
  scope?: string;
  /** When the token was last refreshed — useful for diagnostics. */
  updatedAt?: string;
}

/** State we keep while the OAuth authorization flow is in progress. */
export interface QuickBooksOAuthState {
  companyId: string;
  codeVerifier: string;
  createdAt: string;
  redirectUri: string;
}

export interface QuickBooksAddress {
  line1?: string;
  city?: string;
  region?: string;
  postalCode?: string;
  country?: string;
}

export interface QuickBooksInvoiceLine {
  description: string;
  amount: number;
}

export interface QuickBooksInvoiceSummary {
  id: string;
  docNumber?: string;
  customerId?: string;
  customerName?: string;
  totalAmount: number;
  balance: number;
  currency?: string;
  dueDate?: string;
  txnDate?: string;
  status: "paid" | "unpaid" | "overdue" | "unknown";
}

export interface QuickBooksCustomerSummary {
  id: string;
  displayName: string;
  email?: string;
  phone?: string;
  balance?: number;
  active?: boolean;
}

export interface QuickBooksExpenseSummary {
  id: string;
  totalAmount: number;
  txnDate?: string;
  paymentType?: string;
  accountRef?: string;
  entityRef?: string;
  memo?: string;
}

export interface QuickBooksPaymentSummary {
  id: string;
  customerId?: string;
  totalAmount: number;
  txnDate?: string;
  paymentMethod?: string;
  memo?: string;
}
