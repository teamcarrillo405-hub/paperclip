import type { QuickBooksClient } from "../client.js";
import type { QuickBooksPaymentSummary } from "../types.js";

interface RawPayment {
  Id: string;
  TotalAmt?: number;
  TxnDate?: string;
  CustomerRef?: { value: string; name?: string };
  PaymentMethodRef?: { value: string; name?: string };
  PrivateNote?: string;
}

function summarize(p: RawPayment): QuickBooksPaymentSummary {
  return {
    id: p.Id,
    customerId: p.CustomerRef?.value,
    totalAmount: p.TotalAmt ?? 0,
    txnDate: p.TxnDate,
    paymentMethod: p.PaymentMethodRef?.name ?? p.PaymentMethodRef?.value,
    memo: p.PrivateNote,
  };
}

function escapeSql(value: string): string {
  return value.replace(/'/g, "''");
}

export async function listPayments(
  client: QuickBooksClient,
  params: { startDate?: string; endDate?: string; customerId?: string } = {},
): Promise<QuickBooksPaymentSummary[]> {
  const where: string[] = [];
  if (params.customerId) where.push(`CustomerRef = '${escapeSql(params.customerId)}'`);
  if (params.startDate) where.push(`TxnDate >= '${escapeSql(params.startDate)}'`);
  if (params.endDate) where.push(`TxnDate <= '${escapeSql(params.endDate)}'`);
  const sql = `SELECT * FROM Payment${where.length ? ` WHERE ${where.join(" AND ")}` : ""} MAXRESULTS 500`;
  const resp = await client.query<{ QueryResponse?: { Payment?: RawPayment[] } }>(sql);
  return (resp.QueryResponse?.Payment ?? []).map(summarize);
}

export interface RecordPaymentInput {
  customerId: string;
  totalAmount: number;
  txnDate?: string;
  /** Optional list of invoice IDs that this payment settles. */
  invoiceIds?: string[];
  memo?: string;
}

export async function recordPayment(
  client: QuickBooksClient,
  input: RecordPaymentInput,
): Promise<{ summary: QuickBooksPaymentSummary; raw: RawPayment }> {
  const payload: Record<string, unknown> = {
    CustomerRef: { value: input.customerId },
    TotalAmt: input.totalAmount,
  };
  if (input.txnDate) payload.TxnDate = input.txnDate;
  if (input.memo) payload.PrivateNote = input.memo;
  if (input.invoiceIds && input.invoiceIds.length > 0) {
    payload.Line = input.invoiceIds.map((id) => ({
      Amount: input.totalAmount / input.invoiceIds!.length,
      LinkedTxn: [{ TxnId: id, TxnType: "Invoice" }],
    }));
  }

  const resp = await client.createEntity<{ Payment: RawPayment }>("payment", payload);
  return { summary: summarize(resp.Payment), raw: resp.Payment };
}
