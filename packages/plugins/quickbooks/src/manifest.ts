import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.quickbooks";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listInvoices: "quickbooks_list_invoices",
  getInvoice: "quickbooks_get_invoice",
  createInvoice: "quickbooks_create_invoice",
  sendInvoice: "quickbooks_send_invoice",
  listCustomers: "quickbooks_list_customers",
  getCustomer: "quickbooks_get_customer",
  createCustomer: "quickbooks_create_customer",
  listExpenses: "quickbooks_list_expenses",
  listPayments: "quickbooks_list_payments",
  profitLoss: "quickbooks_profit_loss",
  arAging: "quickbooks_ar_aging",
  getCompanyInfo: "quickbooks_get_company_info",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "QuickBooks Online",
  description: "Connects Paperclip agents to QuickBooks Online for invoices, customers, expenses, payments and financial reports.",
  author: "Avero AI",
  categories: ["connector", "automation"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "plugin.state.write",
    "http.outbound",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.listInvoices,
      displayName: "QuickBooks: List Invoices",
      description: "List invoices for the connected QuickBooks company. Optional filters: status (paid/unpaid/overdue), limit, customerId.",
      parametersSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["paid", "unpaid", "overdue"] },
          limit: { type: "number" },
          customerId: { type: "string" },
        },
      },
    },
    {
      name: TOOL_NAMES.getInvoice,
      displayName: "QuickBooks: Get Invoice",
      description: "Fetch a single invoice by its QuickBooks ID.",
      parametersSchema: {
        type: "object",
        properties: { invoiceId: { type: "string" } },
        required: ["invoiceId"],
      },
    },
    {
      name: TOOL_NAMES.createInvoice,
      displayName: "QuickBooks: Create Invoice",
      description: "Create a new invoice for a customer with one or more line items.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          lineItems: {
            type: "array",
            items: {
              type: "object",
              properties: {
                description: { type: "string" },
                amount: { type: "number" },
              },
              required: ["description", "amount"],
            },
          },
          dueDate: { type: "string" },
          memo: { type: "string" },
        },
        required: ["customerId", "lineItems"],
      },
    },
    {
      name: TOOL_NAMES.sendInvoice,
      displayName: "QuickBooks: Send Invoice",
      description: "Send an existing invoice via QuickBooks email to the supplied address.",
      parametersSchema: {
        type: "object",
        properties: {
          invoiceId: { type: "string" },
          emailAddress: { type: "string" },
        },
        required: ["invoiceId", "emailAddress"],
      },
    },
    {
      name: TOOL_NAMES.listCustomers,
      displayName: "QuickBooks: List Customers",
      description: "List customers. Optional display-name substring filter via `query`.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number" },
          query: { type: "string" },
        },
      },
    },
    {
      name: TOOL_NAMES.getCustomer,
      displayName: "QuickBooks: Get Customer",
      description: "Fetch a single customer by QuickBooks ID.",
      parametersSchema: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
    },
    {
      name: TOOL_NAMES.createCustomer,
      displayName: "QuickBooks: Create Customer",
      description: "Create a new QuickBooks customer.",
      parametersSchema: {
        type: "object",
        properties: {
          displayName: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          address: {
            type: "object",
            properties: {
              line1: { type: "string" },
              city: { type: "string" },
              region: { type: "string" },
              postalCode: { type: "string" },
              country: { type: "string" },
            },
          },
        },
        required: ["displayName"],
      },
    },
    {
      name: TOOL_NAMES.listExpenses,
      displayName: "QuickBooks: List Expenses",
      description: "List expense transactions (Purchase entities) within an optional date range.",
      parametersSchema: {
        type: "object",
        properties: {
          startDate: { type: "string" },
          endDate: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: TOOL_NAMES.listPayments,
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
    {
      name: TOOL_NAMES.profitLoss,
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
    {
      name: TOOL_NAMES.arAging,
      displayName: "QuickBooks: A/R Aging",
      description: "Fetch the accounts-receivable aging summary.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.getCompanyInfo,
      displayName: "QuickBooks: Company Info",
      description: "Fetch the connected company's name, address, and fiscal-year settings.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
};

export default manifest;
