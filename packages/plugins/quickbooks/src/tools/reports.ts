import type { QuickBooksClient } from "../client.js";

export interface ReportSummary {
  name: string;
  startDate?: string;
  endDate?: string;
  totals: Record<string, number>;
  /** The raw QuickBooks report payload. */
  raw: unknown;
}

interface RawReport {
  Header?: {
    ReportName?: string;
    StartPeriod?: string;
    EndPeriod?: string;
    Time?: string;
    Currency?: string;
  };
  Rows?: { Row?: unknown[] };
}

/**
 * Walk a QuickBooks report row tree, looking for summary rows with a title
 * column and a set of numeric columns, and collect them into a flat totals map.
 */
function extractTotals(rows: unknown[] | undefined, sink: Record<string, number>): void {
  if (!rows) return;
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    if (r.type === "Section" && r.Summary) {
      const summary = r.Summary as Record<string, unknown>;
      const colData = (summary.ColData ?? []) as Array<Record<string, unknown>>;
      if (colData.length >= 2) {
        const title = String(colData[0]?.value ?? "").trim();
        const lastValue = colData[colData.length - 1]?.value;
        const numeric = typeof lastValue === "string" ? parseFloat(lastValue) : Number(lastValue);
        if (title && Number.isFinite(numeric)) sink[title] = numeric;
      }
    }
    const nested = r.Rows as { Row?: unknown[] } | undefined;
    if (nested) extractTotals(nested.Row, sink);
  }
}

function summarizeReport(raw: RawReport): ReportSummary {
  const totals: Record<string, number> = {};
  extractTotals(raw.Rows?.Row, totals);
  return {
    name: raw.Header?.ReportName ?? "Report",
    startDate: raw.Header?.StartPeriod,
    endDate: raw.Header?.EndPeriod,
    totals,
    raw,
  };
}

export async function profitAndLoss(
  client: QuickBooksClient,
  params: { startDate: string; endDate: string },
): Promise<ReportSummary> {
  const raw = await client.report<RawReport>("ProfitAndLoss", {
    start_date: params.startDate,
    end_date: params.endDate,
  });
  return summarizeReport(raw);
}

export async function balanceSheet(
  client: QuickBooksClient,
  params: { startDate?: string; endDate?: string } = {},
): Promise<ReportSummary> {
  const raw = await client.report<RawReport>("BalanceSheet", {
    start_date: params.startDate,
    end_date: params.endDate,
  });
  return summarizeReport(raw);
}

export async function arAging(
  client: QuickBooksClient,
): Promise<ReportSummary> {
  const raw = await client.report<RawReport>("AgedReceivables", {});
  return summarizeReport(raw);
}
