import type { QuickBooksClient } from "../client.js";
import type { QuickBooksAddress, QuickBooksCustomerSummary } from "../types.js";

interface RawCustomer {
  Id: string;
  DisplayName?: string;
  Active?: boolean;
  Balance?: number;
  PrimaryEmailAddr?: { Address?: string };
  PrimaryPhone?: { FreeFormNumber?: string };
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

function summarize(c: RawCustomer): QuickBooksCustomerSummary {
  return {
    id: c.Id,
    displayName: c.DisplayName ?? "",
    email: c.PrimaryEmailAddr?.Address,
    phone: c.PrimaryPhone?.FreeFormNumber,
    balance: c.Balance,
    active: c.Active,
  };
}

export async function listCustomers(
  client: QuickBooksClient,
  params: { limit?: number; query?: string } = {},
): Promise<QuickBooksCustomerSummary[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
  const where: string[] = [];
  if (params.query) where.push(`DisplayName LIKE '%${escapeSql(params.query)}%'`);
  const sql = `SELECT * FROM Customer${where.length ? ` WHERE ${where.join(" AND ")}` : ""} MAXRESULTS ${limit}`;
  const resp = await client.query<{ QueryResponse?: { Customer?: RawCustomer[] } }>(sql);
  return (resp.QueryResponse?.Customer ?? []).map(summarize);
}

export async function getCustomer(
  client: QuickBooksClient,
  customerId: string,
): Promise<{ summary: QuickBooksCustomerSummary; raw: RawCustomer }> {
  const resp = await client.getEntity<{ Customer: RawCustomer }>("customer", customerId);
  return { summary: summarize(resp.Customer), raw: resp.Customer };
}

export interface CreateCustomerInput {
  displayName: string;
  email?: string;
  phone?: string;
  address?: QuickBooksAddress;
}

export async function createCustomer(
  client: QuickBooksClient,
  input: CreateCustomerInput,
): Promise<{ summary: QuickBooksCustomerSummary; raw: RawCustomer }> {
  const payload: Record<string, unknown> = {
    DisplayName: input.displayName,
  };
  if (input.email) payload.PrimaryEmailAddr = { Address: input.email };
  if (input.phone) payload.PrimaryPhone = { FreeFormNumber: input.phone };
  if (input.address) {
    const addr: Record<string, unknown> = {};
    if (input.address.line1) addr.Line1 = input.address.line1;
    if (input.address.city) addr.City = input.address.city;
    if (input.address.region) addr.CountrySubDivisionCode = input.address.region;
    if (input.address.postalCode) addr.PostalCode = input.address.postalCode;
    if (input.address.country) addr.Country = input.address.country;
    payload.BillAddr = addr;
  }

  const resp = await client.createEntity<{ Customer: RawCustomer }>("customer", payload);
  return { summary: summarize(resp.Customer), raw: resp.Customer };
}
