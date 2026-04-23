import type { QuickBooksClient } from "../client.js";
import type { QuickBooksExpenseSummary } from "../types.js";

interface RawPurchase {
  Id: string;
  TotalAmt?: number;
  TxnDate?: string;
  PaymentType?: string;
  AccountRef?: { value: string; name?: string };
  EntityRef?: { value: string; name?: string };
  PrivateNote?: string;
}

function summarize(p: RawPurchase): QuickBooksExpenseSummary {
  return {
    id: p.Id,
    totalAmount: p.TotalAmt ?? 0,
    txnDate: p.TxnDate,
    paymentType: p.PaymentType,
    accountRef: p.AccountRef?.name ?? p.AccountRef?.value,
    entityRef: p.EntityRef?.name ?? p.EntityRef?.value,
    memo: p.PrivateNote,
  };
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

export async function listExpenses(
  client: QuickBooksClient,
  params: { startDate?: string; endDate?: string; limit?: number } = {},
): Promise<QuickBooksExpenseSummary[]> {
  const limit = Math.min(Math.max(params.limit ?? 100, 1), 1000);
  const where: string[] = [];
  if (params.startDate) where.push(`TxnDate >= '${escapeSql(params.startDate)}'`);
  if (params.endDate) where.push(`TxnDate <= '${escapeSql(params.endDate)}'`);
  const sql = `SELECT * FROM Purchase${where.length ? ` WHERE ${where.join(" AND ")}` : ""} MAXRESULTS ${limit}`;
  const resp = await client.query<{ QueryResponse?: { Purchase?: RawPurchase[] } }>(sql);
  return (resp.QueryResponse?.Purchase ?? []).map(summarize);
}

export async function getExpense(
  client: QuickBooksClient,
  expenseId: string,
): Promise<{ summary: QuickBooksExpenseSummary; raw: RawPurchase }> {
  const resp = await client.getEntity<{ Purchase: RawPurchase }>("purchase", expenseId);
  return { summary: summarize(resp.Purchase), raw: resp.Purchase };
}
