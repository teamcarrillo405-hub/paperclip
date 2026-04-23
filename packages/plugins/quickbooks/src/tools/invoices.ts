import type { QuickBooksClient } from "../client.js";
import type { QuickBooksInvoiceSummary } from "../types.js";

interface RawInvoice {
  Id: string;
  DocNumber?: string;
  TotalAmt?: number;
  Balance?: number;
  CurrencyRef?: { value: string };
  DueDate?: string;
  TxnDate?: string;
  CustomerRef?: { value: string; name?: string };
}

function invoiceStatus(inv: RawInvoice, now: Date = new Date()): QuickBooksInvoiceSummary["status"] {
  const balance = inv.Balance ?? 0;
  const total = inv.TotalAmt ?? 0;
  if (balance <= 0 && total > 0) return "paid";
  if (balance > 0 && inv.DueDate) {
    const due = new Date(inv.DueDate);
    if (Number.isFinite(due.getTime()) && due < now) return "overdue";
  }
  if (balance > 0) return "unpaid";
  return "unknown";
}

function summarize(inv: RawInvoice): QuickBooksInvoiceSummary {
  return {
    id: inv.Id,
    docNumber: inv.DocNumber,
    customerId: inv.CustomerRef?.value,
    customerName: inv.CustomerRef?.name,
    totalAmount: inv.TotalAmt ?? 0,
    balance: inv.Balance ?? 0,
    currency: inv.CurrencyRef?.value,
    dueDate: inv.DueDate,
    txnDate: inv.TxnDate,
    status: invoiceStatus(inv),
  };
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

export async function listInvoices(
  client: QuickBooksClient,
  params: { status?: "paid" | "unpaid" | "overdue"; limit?: number; customerId?: string } = {},
): Promise<QuickBooksInvoiceSummary[]> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 1000);
  const where: string[] = [];
  if (params.customerId) where.push(`CustomerRef = '${escapeSql(params.customerId)}'`);
  if (params.status === "paid") where.push("Balance = '0'");
  if (params.status === "unpaid" || params.status === "overdue") where.push("Balance > '0'");

  const sql = `SELECT * FROM Invoice${where.length ? ` WHERE ${where.join(" AND ")}` : ""} MAXRESULTS ${limit}`;
  const resp = await client.query<{ QueryResponse?: { Invoice?: RawInvoice[] } }>(sql);
  const rows = resp.QueryResponse?.Invoice ?? [];
  const summaries = rows.map(summarize);
  if (params.status === "overdue") return summaries.filter((s) => s.status === "overdue");
  return summaries;
}

export async function getInvoice(
  client: QuickBooksClient,
  invoiceId: string,
): Promise<{ summary: QuickBooksInvoiceSummary; raw: RawInvoice }> {
  const resp = await client.getEntity<{ Invoice: RawInvoice }>("invoice", invoiceId);
  return { summary: summarize(resp.Invoice), raw: resp.Invoice };
}

export interface CreateInvoiceInput {
  customerId: string;
  lineItems: Array<{ description: string; amount: number }>;
  dueDate?: string;
  memo?: string;
}

export async function createInvoice(
  client: QuickBooksClient,
  input: CreateInvoiceInput,
): Promise<{ summary: QuickBooksInvoiceSummary; raw: RawInvoice }> {
  const Line = input.lineItems.map((item, idx) => ({
    DetailType: "SalesItemLineDetail",
    Amount: item.amount,
    Description: item.description,
    LineNum: idx + 1,
    SalesItemLineDetail: {},
  }));

  const payload: Record<string, unknown> = {
    CustomerRef: { value: input.customerId },
    Line,
  };
  if (input.dueDate) payload.DueDate = input.dueDate;
  if (input.memo) payload.CustomerMemo = { value: input.memo };

  const resp = await client.createEntity<{ Invoice: RawInvoice }>("invoice", payload);
  return { summary: summarize(resp.Invoice), raw: resp.Invoice };
}

export async function sendInvoice(
  client: QuickBooksClient,
  invoiceId: string,
  emailAddress: string,
): Promise<{ summary: QuickBooksInvoiceSummary; raw: RawInvoice }> {
  const resp = await client.sendInvoice<{ Invoice: RawInvoice }>(invoiceId, emailAddress);
  return { summary: summarize(resp.Invoice), raw: resp.Invoice };
}
