/**
 * Financial Summary service — the core of the AI Bookkeeper.
 *
 * Pulls the latest P&L, A/R aging, and invoice/expense lists from QuickBooks,
 * computes a financial health score, and runs the numbers through LangChain
 * to produce plain-English insights, alerts, and recommendations.
 *
 * Results are cached in-memory for 1 hour per (companyId, period) key.
 */

import type { Db } from "@paperclipai/db";
import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { StringOutputParser } from "@langchain/core/output_parsers";
import {
  createQuickBooksClient,
  type QuickBooksClient,
  profitAndLoss,
  arAging,
  listInvoices,
  listExpenses,
  QuickBooksNotConnectedError,
} from "@paperclipai/plugin-quickbooks";
import { pluginStateStore } from "./plugin-state-store.js";
import { pluginRegistryService } from "./plugin-registry.js";
import { logger } from "../middleware/logger.js";

const QB_PLUGIN_KEY = "paperclip.quickbooks";
const QB_STATE_NAMESPACE = "quickbooks";
const QB_TOKEN_STATE_KEY = "oauth-token";

export type FinancialHealthLabel =
  | "Excellent"
  | "Good"
  | "Fair"
  | "Needs Attention";

export interface FinancialSummary {
  period: string;
  healthScore: number;
  healthLabel: FinancialHealthLabel;
  headline: string;
  insights: string[];
  alerts: string[];
  recommendations: string[];
  revenue: number;
  expenses: number;
  netIncome: number;
  outstandingAR: number;
  overdueInvoices: number;
}

export interface FinancialPeriod {
  /** "current" for current month, "last" for prior month, or a YYYY-MM label. */
  label: string;
  startDate: string;
  endDate: string;
}

interface CachedEntry {
  expiresAt: number;
  value: FinancialSummary;
}

const CACHE_TTL_MS = 60 * 60 * 1000;
const cache = new Map<string, CachedEntry>();

function cacheKey(companyId: string, periodLabel: string): string {
  return `${companyId}::${periodLabel}`;
}

/**
 * Resolve a period label into concrete ISO dates.
 *
 * "current" → the first day of this month → today
 * "last" → the first day of last month → the last day of last month
 * "YYYY-MM" → that full calendar month
 */
export function resolvePeriod(label: string | undefined, now: Date = new Date()): FinancialPeriod {
  const effective = (label ?? "current").toLowerCase();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  if (effective === "current") {
    const start = new Date(Date.UTC(y, m, 1));
    return {
      label: "current",
      startDate: start.toISOString().slice(0, 10),
      endDate: now.toISOString().slice(0, 10),
    };
  }
  if (effective === "last") {
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 0));
    return {
      label: "last",
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }
  const match = /^(\d{4})-(\d{2})$/.exec(effective);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    return {
      label: effective,
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }
  // Unknown label — fall back to current month.
  const start = new Date(Date.UTC(y, m, 1));
  return {
    label: "current",
    startDate: start.toISOString().slice(0, 10),
    endDate: now.toISOString().slice(0, 10),
  };
}

function pickReportTotal(totals: Record<string, number>, keys: string[]): number {
  for (const key of keys) {
    const lower = key.toLowerCase();
    for (const [name, value] of Object.entries(totals)) {
      if (name.toLowerCase().includes(lower)) return value;
    }
  }
  return 0;
}

/**
 * Compute a 0–100 financial health score. The weights reflect small-business
 * priorities: profitability matters most, then cash collection, then margin.
 */
export function computeHealthScore(input: {
  revenue: number;
  expenses: number;
  netIncome: number;
  outstandingAR: number;
  overdueInvoices: number;
}): number {
  let score = 50;

  if (input.revenue > 0) {
    const margin = input.netIncome / input.revenue;
    if (margin >= 0.2) score += 30;
    else if (margin >= 0.1) score += 20;
    else if (margin >= 0) score += 10;
    else if (margin >= -0.1) score -= 10;
    else score -= 25;
  } else if (input.expenses > 0) {
    score -= 20;
  }

  if (input.overdueInvoices === 0) score += 10;
  else if (input.overdueInvoices <= 2) score += 5;
  else if (input.overdueInvoices >= 10) score -= 15;
  else if (input.overdueInvoices >= 5) score -= 8;

  if (input.revenue > 0) {
    const arRatio = input.outstandingAR / input.revenue;
    if (arRatio <= 0.2) score += 10;
    else if (arRatio >= 1.5) score -= 15;
    else if (arRatio >= 0.75) score -= 5;
  }

  if (score < 0) return 0;
  if (score > 100) return 100;
  return Math.round(score);
}

export function healthLabelFor(score: number): FinancialHealthLabel {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 50) return "Fair";
  return "Needs Attention";
}

interface RawFinancials {
  period: FinancialPeriod;
  revenue: number;
  expenses: number;
  netIncome: number;
  outstandingAR: number;
  overdueInvoices: number;
  topExpenseCategories: Array<{ name: string; amount: number }>;
}

async function loadRawFinancials(
  client: QuickBooksClient,
  period: FinancialPeriod,
): Promise<RawFinancials> {
  const [pnl, ar, overdue, expenses] = await Promise.all([
    profitAndLoss(client, { startDate: period.startDate, endDate: period.endDate }),
    arAging(client).catch(() => null),
    listInvoices(client, { status: "overdue", limit: 200 }).catch(() => []),
    listExpenses(client, { startDate: period.startDate, endDate: period.endDate, limit: 200 })
      .catch(() => []),
  ]);

  const revenue = pickReportTotal(pnl.totals, ["Total Income", "Income", "Revenue"]);
  const totalExpenses = pickReportTotal(pnl.totals, [
    "Total Expenses",
    "Expenses",
  ]);
  const netIncome = pickReportTotal(pnl.totals, ["Net Income", "Net Operating Income"]);

  const outstandingAR = ar ? pickReportTotal(ar.totals, ["Total", "Grand Total"]) : 0;

  const byCategory = new Map<string, number>();
  for (const expense of expenses) {
    const key = expense.accountRef ?? "Uncategorized";
    byCategory.set(key, (byCategory.get(key) ?? 0) + (expense.totalAmount ?? 0));
  }
  const topExpenseCategories = Array.from(byCategory.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([name, amount]) => ({ name, amount }));

  return {
    period,
    revenue,
    expenses: totalExpenses || netIncome ? totalExpenses : 0,
    netIncome,
    outstandingAR,
    overdueInvoices: overdue.length,
    topExpenseCategories,
  };
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

interface AiNarrative {
  headline: string;
  insights: string[];
  alerts: string[];
  recommendations: string[];
}

/**
 * Fallback narrative used when the LangChain call fails or no API key is
 * configured. Still produces sensible plain-English output so the page
 * renders correctly.
 */
function heuristicNarrative(raw: RawFinancials, score: number): AiNarrative {
  const margin = raw.revenue > 0 ? raw.netIncome / raw.revenue : 0;
  const headline = raw.netIncome >= 0
    ? `You're profitable: ${currency(raw.netIncome)} on ${currency(raw.revenue)} in revenue.`
    : `You're running a loss of ${currency(Math.abs(raw.netIncome))} this period.`;

  const insights: string[] = [];
  insights.push(`Revenue: ${currency(raw.revenue)}`);
  insights.push(`Expenses: ${currency(raw.expenses)}`);
  insights.push(`Net income: ${currency(raw.netIncome)} (${(margin * 100).toFixed(1)}% margin)`);
  if (raw.topExpenseCategories.length > 0) {
    const top = raw.topExpenseCategories[0];
    insights.push(`Top expense category: ${top.name} at ${currency(top.amount)}`);
  }

  const alerts: string[] = [];
  if (raw.netIncome < 0) alerts.push("Negative net income this period — expenses exceeded revenue.");
  if (raw.overdueInvoices >= 5) {
    alerts.push(`${raw.overdueInvoices} invoices are overdue — follow up on collections.`);
  }
  if (raw.revenue > 0 && raw.outstandingAR > raw.revenue) {
    alerts.push("Outstanding A/R is larger than this period's revenue — cash is tied up.");
  }

  const recommendations: string[] = [];
  if (raw.overdueInvoices > 0) {
    recommendations.push(`Send reminders on the ${raw.overdueInvoices} overdue invoices.`);
  }
  if (margin < 0.1 && raw.revenue > 0) {
    recommendations.push("Review your top expense categories for savings opportunities.");
  }
  if (score >= 80) {
    recommendations.push("Consider setting aside reserves or reinvesting this period's profit.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Keep monitoring daily cash flow and monthly P&L trends.");
  }

  return { headline, insights, alerts, recommendations };
}

function parseAiResponse(text: string): AiNarrative | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
    const obj = JSON.parse(cleaned) as Partial<AiNarrative>;
    if (
      typeof obj.headline === "string"
      && Array.isArray(obj.insights)
      && Array.isArray(obj.alerts)
      && Array.isArray(obj.recommendations)
    ) {
      return {
        headline: obj.headline,
        insights: obj.insights.map(String),
        alerts: obj.alerts.map(String),
        recommendations: obj.recommendations.map(String),
      };
    }
    return null;
  } catch {
    return null;
  }
}

async function generateNarrative(raw: RawFinancials, score: number): Promise<AiNarrative> {
  if (!process.env.OPENAI_API_KEY) {
    return heuristicNarrative(raw, score);
  }
  try {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        "You are a plain-spoken bookkeeper. Given a small business's financial numbers, "
          + "produce clear, actionable analysis. Always return valid JSON with this shape: "
          + "{{\"headline\": string, \"insights\": string[], \"alerts\": string[], \"recommendations\": string[]}}. "
          + "Headline is ONE short sentence. Insights are 3-5 observations about what the numbers mean. "
          + "Alerts are urgent issues (may be empty). Recommendations are 2-4 concrete next actions. "
          + "No markdown, no preamble, just JSON.",
      ],
      [
        "human",
        "Period: {period}\nRevenue: {revenue}\nExpenses: {expenses}\nNet income: {netIncome}\n"
          + "Outstanding A/R: {outstandingAR}\nOverdue invoices: {overdueInvoices}\n"
          + "Top expense categories: {categories}\nHealth score: {score}/100",
      ],
    ]);
    const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0.2 });
    const chain = prompt.pipe(model).pipe(new StringOutputParser());
    const result = await chain.invoke({
      period: `${raw.period.startDate} to ${raw.period.endDate}`,
      revenue: currency(raw.revenue),
      expenses: currency(raw.expenses),
      netIncome: currency(raw.netIncome),
      outstandingAR: currency(raw.outstandingAR),
      overdueInvoices: String(raw.overdueInvoices),
      categories: raw.topExpenseCategories
        .map((c) => `${c.name}=${currency(c.amount)}`)
        .join(", ") || "none",
      score: String(score),
    });
    const parsed = parseAiResponse(result);
    if (parsed) return parsed;
    logger.warn({ result }, "Financial summary LLM returned unparseable output; using heuristic");
    return heuristicNarrative(raw, score);
  } catch (err) {
    logger.warn({ err }, "Financial summary LLM call failed; using heuristic");
    return heuristicNarrative(raw, score);
  }
}

interface MiniLogger {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
  error: (msg: string, meta?: unknown) => void;
  debug: (msg: string, meta?: unknown) => void;
}

/**
 * The QuickBooks client normally runs inside a plugin worker with a real
 * `PluginContext`. On the host side we only need a minimal shim that reads
 * and writes the token row via the shared `pluginStateStore`. This lets the
 * service reuse the same refresh logic as the worker without duplicating it.
 */
function buildHostCtx(db: Db, pluginId: string) {
  const stateStore = pluginStateStore(db);
  const miniLogger: MiniLogger = {
    info: (msg, meta) => logger.info({ meta }, `[financial-summary] ${msg}`),
    warn: (msg, meta) => logger.warn({ meta }, `[financial-summary] ${msg}`),
    error: (msg, meta) => logger.error({ meta }, `[financial-summary] ${msg}`),
    debug: (msg, meta) => logger.debug({ meta }, `[financial-summary] ${msg}`),
  };
  return {
    logger: miniLogger,
    state: {
      get: async (input: {
        scopeKind: "instance" | "company" | "project" | "agent" | "issue";
        scopeId?: string;
        namespace?: string;
        stateKey: string;
      }) => {
        return stateStore.get(pluginId, input.scopeKind, input.stateKey, {
          scopeId: input.scopeId,
          namespace: input.namespace,
        });
      },
      set: async (
        input: {
          scopeKind: "instance" | "company" | "project" | "agent" | "issue";
          scopeId?: string;
          namespace?: string;
          stateKey: string;
        },
        value: Record<string, unknown>,
      ) => {
        await stateStore.set(pluginId, {
          scopeKind: input.scopeKind,
          scopeId: input.scopeId,
          namespace: input.namespace,
          stateKey: input.stateKey,
          value,
        });
      },
      delete: async (input: {
        scopeKind: "instance" | "company" | "project" | "agent" | "issue";
        scopeId?: string;
        namespace?: string;
        stateKey: string;
      }) => {
        await stateStore.delete(pluginId, input.scopeKind, input.stateKey, {
          scopeId: input.scopeId,
          namespace: input.namespace,
        });
      },
    },
  };
}

async function resolveQbClient(db: Db, companyId: string): Promise<QuickBooksClient> {
  const registry = pluginRegistryService(db);
  const plugin = await registry.getByKey(QB_PLUGIN_KEY);
  if (!plugin) throw new QuickBooksNotConnectedError();

  const stateStore = pluginStateStore(db);
  const stored = await stateStore.get(plugin.id, "company", QB_TOKEN_STATE_KEY, {
    scopeId: companyId,
    namespace: QB_STATE_NAMESPACE,
  });
  if (!stored) throw new QuickBooksNotConnectedError();

  const clientId = process.env.QUICKBOOKS_CLIENT_ID ?? "";
  const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET ?? "";
  const sandbox = (process.env.QUICKBOOKS_SANDBOX ?? "true").toLowerCase() !== "false";

  // The QB client type expects a full PluginContext, but only uses `state`
  // and `logger` — cast the minimal shim through `unknown` since filling the
  // full surface would be dead code here.
  const ctx = buildHostCtx(db, plugin.id);
  return createQuickBooksClient(ctx as unknown as Parameters<typeof createQuickBooksClient>[0], companyId, {
    clientId,
    clientSecret,
    sandbox,
  });
}

export interface FinancialSummaryService {
  generate(companyId: string, periodLabel?: string): Promise<FinancialSummary>;
  invalidate(companyId: string, periodLabel?: string): void;
}

export function financialSummaryService(db: Db): FinancialSummaryService {
  return {
    async generate(companyId, periodLabel): Promise<FinancialSummary> {
      const period = resolvePeriod(periodLabel);
      const key = cacheKey(companyId, period.label);
      const now = Date.now();
      const cached = cache.get(key);
      if (cached && cached.expiresAt > now) return cached.value;

      const client = await resolveQbClient(db, companyId);
      const raw = await loadRawFinancials(client, period);
      const healthScore = computeHealthScore({
        revenue: raw.revenue,
        expenses: raw.expenses,
        netIncome: raw.netIncome,
        outstandingAR: raw.outstandingAR,
        overdueInvoices: raw.overdueInvoices,
      });
      const narrative = await generateNarrative(raw, healthScore);

      const summary: FinancialSummary = {
        period: `${period.startDate} to ${period.endDate}`,
        healthScore,
        healthLabel: healthLabelFor(healthScore),
        headline: narrative.headline,
        insights: narrative.insights,
        alerts: narrative.alerts,
        recommendations: narrative.recommendations,
        revenue: raw.revenue,
        expenses: raw.expenses,
        netIncome: raw.netIncome,
        outstandingAR: raw.outstandingAR,
        overdueInvoices: raw.overdueInvoices,
      };
      cache.set(key, { expiresAt: now + CACHE_TTL_MS, value: summary });
      return summary;
    },
    invalidate(companyId, periodLabel) {
      if (periodLabel) {
        cache.delete(cacheKey(companyId, resolvePeriod(periodLabel).label));
        return;
      }
      for (const key of Array.from(cache.keys())) {
        if (key.startsWith(`${companyId}::`)) cache.delete(key);
      }
    },
  };
}

export async function generateFinancialSummary(
  db: Db,
  companyId: string,
  period?: string,
): Promise<FinancialSummary> {
  return financialSummaryService(db).generate(companyId, period);
}
