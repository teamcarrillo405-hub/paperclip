import {
  definePlugin,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import {
  QuickBooksApiError,
  QuickBooksNotConnectedError,
  createQuickBooksClient,
  type QuickBooksClient,
  type QuickBooksClientOptions,
} from "./client.js";
import { TOOL_NAMES } from "./manifest.js";
import {
  createInvoice,
  getInvoice,
  listInvoices,
  sendInvoice,
} from "./tools/invoices.js";
import {
  createCustomer,
  getCustomer,
  listCustomers,
} from "./tools/customers.js";
import { listExpenses } from "./tools/expenses.js";
import { listPayments } from "./tools/payments.js";
import { arAging, profitAndLoss } from "./tools/reports.js";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`QuickBooks plugin misconfigured: ${name} is not set`);
  }
  return value;
}

function clientOptions(): QuickBooksClientOptions {
  return {
    clientId: requiredEnv("QUICKBOOKS_CLIENT_ID"),
    clientSecret: requiredEnv("QUICKBOOKS_CLIENT_SECRET"),
    sandbox: process.env.QUICKBOOKS_SANDBOX === "true",
  };
}

function toolError(err: unknown): ToolResult {
  if (err instanceof QuickBooksNotConnectedError) {
    return { error: err.message };
  }
  if (err instanceof QuickBooksApiError) {
    return { error: err.message };
  }
  if (err instanceof Error) {
    return { error: `QuickBooks plugin error: ${err.message}` };
  }
  return { error: `QuickBooks plugin error: ${String(err)}` };
}

async function runTool<T>(
  ctx: PluginContext,
  companyId: string,
  fn: (client: QuickBooksClient) => Promise<T>,
): Promise<T> {
  const opts = clientOptions();
  const client = createQuickBooksClient(ctx, companyId, opts);
  return fn(client);
}

function extractString(params: unknown, key: string): string | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function extractNumber(params: unknown, key: string): number | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

function extractObject(params: unknown, key: string): Record<string, unknown> | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  }
  return undefined;
}

function extractStatus(params: unknown): "paid" | "unpaid" | "overdue" | undefined {
  const s = extractString(params, "status");
  if (s === "paid" || s === "unpaid" || s === "overdue") return s;
  return undefined;
}

function extractLineItems(params: unknown): Array<{ description: string; amount: number }> {
  if (!params || typeof params !== "object") return [];
  const raw = (params as Record<string, unknown>).lineItems;
  if (!Array.isArray(raw)) return [];
  const out: Array<{ description: string; amount: number }> = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const description = typeof r.description === "string" ? r.description : undefined;
    const amount = typeof r.amount === "number" ? r.amount : undefined;
    if (description && amount !== undefined) {
      out.push({ description, amount });
    }
  }
  return out;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("QuickBooks plugin setup starting", {
      sandbox: process.env.QUICKBOOKS_SANDBOX === "true",
    });

    ctx.tools.register(
      TOOL_NAMES.listInvoices,
      {
        displayName: "QuickBooks: List Invoices",
        description: "List invoices for the connected QuickBooks company.",
        parametersSchema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["paid", "unpaid", "overdue"] },
            limit: { type: "number" },
            customerId: { type: "string" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          const invoices = await runTool(ctx, runCtx.companyId, (c) =>
            listInvoices(c, {
              status: extractStatus(params),
              limit: extractNumber(params, "limit"),
              customerId: extractString(params, "customerId"),
            }),
          );
          return {
            content: `Found ${invoices.length} invoices.`,
            data: invoices,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getInvoice,
      {
        displayName: "QuickBooks: Get Invoice",
        description: "Fetch a single invoice by its QuickBooks ID.",
        parametersSchema: {
          type: "object",
          properties: { invoiceId: { type: "string" } },
          required: ["invoiceId"],
        },
      },
      async (params, runCtx) => {
        const invoiceId = extractString(params, "invoiceId");
        if (!invoiceId) return { error: "`invoiceId` is required" };
        try {
          const result = await runTool(ctx, runCtx.companyId, (c) => getInvoice(c, invoiceId));
          return {
            content: `Invoice ${result.summary.docNumber ?? result.summary.id} — $${result.summary.totalAmount.toFixed(2)} (${result.summary.status}).`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.createInvoice,
      {
        displayName: "QuickBooks: Create Invoice",
        description: "Create a new invoice for a customer with one or more line items.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            lineItems: { type: "array" },
            dueDate: { type: "string" },
            memo: { type: "string" },
          },
          required: ["customerId", "lineItems"],
        },
      },
      async (params, runCtx) => {
        const customerId = extractString(params, "customerId");
        const lineItems = extractLineItems(params);
        if (!customerId) return { error: "`customerId` is required" };
        if (lineItems.length === 0) return { error: "`lineItems` must be a non-empty array of { description, amount }" };
        try {
          const result = await runTool(ctx, runCtx.companyId, (c) =>
            createInvoice(c, {
              customerId,
              lineItems,
              dueDate: extractString(params, "dueDate"),
              memo: extractString(params, "memo"),
            }),
          );
          return {
            content: `Created invoice ${result.summary.docNumber ?? result.summary.id} ($${result.summary.totalAmount.toFixed(2)}).`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.sendInvoice,
      {
        displayName: "QuickBooks: Send Invoice",
        description: "Email an existing invoice to the supplied address via QuickBooks.",
        parametersSchema: {
          type: "object",
          properties: {
            invoiceId: { type: "string" },
            emailAddress: { type: "string" },
          },
          required: ["invoiceId", "emailAddress"],
        },
      },
      async (params, runCtx) => {
        const invoiceId = extractString(params, "invoiceId");
        const emailAddress = extractString(params, "emailAddress");
        if (!invoiceId) return { error: "`invoiceId` is required" };
        if (!emailAddress) return { error: "`emailAddress` is required" };
        try {
          const result = await runTool(ctx, runCtx.companyId, (c) =>
            sendInvoice(c, invoiceId, emailAddress),
          );
          return {
            content: `Invoice ${result.summary.docNumber ?? result.summary.id} sent to ${emailAddress}.`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listCustomers,
      {
        displayName: "QuickBooks: List Customers",
        description: "List customers, optionally filtered by display-name substring.",
        parametersSchema: {
          type: "object",
          properties: {
            limit: { type: "number" },
            query: { type: "string" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          const customers = await runTool(ctx, runCtx.companyId, (c) =>
            listCustomers(c, {
              limit: extractNumber(params, "limit"),
              query: extractString(params, "query"),
            }),
          );
          return {
            content: `Found ${customers.length} customers.`,
            data: customers,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCustomer,
      {
        displayName: "QuickBooks: Get Customer",
        description: "Fetch a single customer by QuickBooks ID.",
        parametersSchema: {
          type: "object",
          properties: { customerId: { type: "string" } },
          required: ["customerId"],
        },
      },
      async (params, runCtx) => {
        const customerId = extractString(params, "customerId");
        if (!customerId) return { error: "`customerId` is required" };
        try {
          const result = await runTool(ctx, runCtx.companyId, (c) => getCustomer(c, customerId));
          return {
            content: `Customer ${result.summary.displayName} (${result.summary.id}).`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.createCustomer,
      {
        displayName: "QuickBooks: Create Customer",
        description: "Create a new QuickBooks customer.",
        parametersSchema: {
          type: "object",
          properties: {
            displayName: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            address: { type: "object" },
          },
          required: ["displayName"],
        },
      },
      async (params, runCtx) => {
        const displayName = extractString(params, "displayName");
        if (!displayName) return { error: "`displayName` is required" };
        const address = extractObject(params, "address");
        try {
          const result = await runTool(ctx, runCtx.companyId, (c) =>
            createCustomer(c, {
              displayName,
              email: extractString(params, "email"),
              phone: extractString(params, "phone"),
              address: address
                ? {
                  line1: typeof address.line1 === "string" ? address.line1 : undefined,
                  city: typeof address.city === "string" ? address.city : undefined,
                  region: typeof address.region === "string" ? address.region : undefined,
                  postalCode: typeof address.postalCode === "string" ? address.postalCode : undefined,
                  country: typeof address.country === "string" ? address.country : undefined,
                }
                : undefined,
            }),
          );
          return {
            content: `Created customer ${result.summary.displayName} (${result.summary.id}).`,
            data: result,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listExpenses,
      {
        displayName: "QuickBooks: List Expenses",
        description: "List expense transactions within an optional date range.",
        parametersSchema: {
          type: "object",
          properties: {
            startDate: { type: "string" },
            endDate: { type: "string" },
            limit: { type: "number" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          const expenses = await runTool(ctx, runCtx.companyId, (c) =>
            listExpenses(c, {
              startDate: extractString(params, "startDate"),
              endDate: extractString(params, "endDate"),
              limit: extractNumber(params, "limit"),
            }),
          );
          return {
            content: `Found ${expenses.length} expenses.`,
            data: expenses,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listPayments,
      {
        displayName: "QuickBooks: List Payments",
        description: "List customer payments, optionally filtered by date or customerId.",
        parametersSchema: {
          type: "object",
          properties: {
            startDate: { type: "string" },
            endDate: { type: "string" },
            customerId: { type: "string" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          const payments = await runTool(ctx, runCtx.companyId, (c) =>
            listPayments(c, {
              startDate: extractString(params, "startDate"),
              endDate: extractString(params, "endDate"),
              customerId: extractString(params, "customerId"),
            }),
          );
          return {
            content: `Found ${payments.length} payments.`,
            data: payments,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.profitLoss,
      {
        displayName: "QuickBooks: Profit & Loss",
        description: "Fetch the profit-and-loss report for a date range.",
        parametersSchema: {
          type: "object",
          properties: {
            startDate: { type: "string" },
            endDate: { type: "string" },
          },
          required: ["startDate", "endDate"],
        },
      },
      async (params, runCtx) => {
        const startDate = extractString(params, "startDate");
        const endDate = extractString(params, "endDate");
        if (!startDate || !endDate) return { error: "`startDate` and `endDate` are required" };
        try {
          const report = await runTool(ctx, runCtx.companyId, (c) =>
            profitAndLoss(c, { startDate, endDate }),
          );
          const netIncome = report.totals["Net Income"] ?? report.totals["Net Operating Income"];
          const incomeSummary = netIncome !== undefined ? ` Net Income: $${netIncome.toFixed(2)}.` : "";
          return {
            content: `Profit & Loss ${startDate} → ${endDate}.${incomeSummary}`,
            data: report,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.arAging,
      {
        displayName: "QuickBooks: A/R Aging",
        description: "Fetch the accounts-receivable aging summary.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        try {
          const report = await runTool(ctx, runCtx.companyId, (c) => arAging(c));
          const total = report.totals["TOTAL"] ?? report.totals["Total"];
          return {
            content: `A/R Aging${total !== undefined ? ` — Total: $${total.toFixed(2)}` : ""}.`,
            data: report,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCompanyInfo,
      {
        displayName: "QuickBooks: Company Info",
        description: "Fetch the connected company's name, address, and fiscal-year settings.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        try {
          const info = await runTool(ctx, runCtx.companyId, (c) =>
            c.companyInfo<{ CompanyInfo: Record<string, unknown> }>(),
          );
          const company = info.CompanyInfo as Record<string, unknown> | undefined;
          const name = typeof company?.CompanyName === "string" ? company.CompanyName : undefined;
          return {
            content: name ? `Connected to QuickBooks company: ${name}.` : "Fetched company info.",
            data: info,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.logger.info("QuickBooks plugin setup complete");
  },

  async onHealth() {
    const hasClientId = typeof process.env.QUICKBOOKS_CLIENT_ID === "string"
      && process.env.QUICKBOOKS_CLIENT_ID.length > 0;
    const hasClientSecret = typeof process.env.QUICKBOOKS_CLIENT_SECRET === "string"
      && process.env.QUICKBOOKS_CLIENT_SECRET.length > 0;
    if (!hasClientId || !hasClientSecret) {
      return {
        status: "degraded",
        message: "QUICKBOOKS_CLIENT_ID and/or QUICKBOOKS_CLIENT_SECRET environment variables are missing.",
      };
    }
    return { status: "ok", message: "QuickBooks plugin configured." };
  },
});

export default plugin;
