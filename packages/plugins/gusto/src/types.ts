/**
 * Gusto Payroll entity types for the Gusto plugin.
 *
 * These interfaces mirror the shapes defined in server/src/services/gusto-client.ts
 * and are duplicated here so the plugin package is fully self-contained.
 */

/** Stored per-company OAuth token in the plugin state store. */
export interface GustoToken {
  accessToken: string;
  refreshToken: string;
  /** ISO 8601 timestamp — absolute expiry for the access token. */
  expiresAt: string;
  tokenType: string;
  /** Gusto's UUID for the connected company. */
  gustoCompanyUuid: string;
  /** Display name of the Gusto company. */
  gustoCompanyName: string;
  /** ISO 8601 timestamp — when the token was last stored or refreshed. */
  updatedAt?: string;
}

export interface GustoEmployee {
  uuid: string;
  first_name: string;
  last_name: string;
  email: string | null;
  job_title: string | null;
  department: string | null;
  employment_status: string;
  start_date: string | null;
}

export interface GustoPayroll {
  payroll_uuid: string;
  processed: boolean;
  pay_period: { start_date: string; end_date: string };
  totals?: { company_debit: string; net_pay: string; gross_pay: string };
}

export interface GustoCompanyInfo {
  uuid: string;
  name: string;
  ein: string | null;
  entity_type: string | null;
  number_of_employees: number;
}

export interface GustoPaySchedule {
  uuid: string;
  frequency: string;
  anchor_pay_date: string;
  day_1: number | null;
  day_2: number | null;
}
