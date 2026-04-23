/**
 * Customer 360 plugin worker.
 *
 * Registers the 12 agent-facing tools. The worker uses an in-process
 * `CustomerService` keyed by companyId so a single worker process can serve
 * any number of companies. Optional Twenty CRM sync is configured via the
 * TWENTY_INTERNAL_URL and TWENTY_API_KEY env vars.
 */

import {
  definePlugin,
  type PluginContext,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import { CustomerService } from "./customer-service.js";
import { TOOL_NAMES } from "./manifest.js";

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

function toolError(err: unknown): ToolResult {
  if (err instanceof Error) return { error: `Customer360 error: ${err.message}` };
  return { error: `Customer360 error: ${String(err)}` };
}

const services = new Map<string, CustomerService>();

function serviceFor(companyId: string): CustomerService {
  let svc = services.get(companyId);
  if (!svc) {
    svc = new CustomerService({ companyId });
    services.set(companyId, svc);
  }
  return svc;
}

const plugin = definePlugin({
  async setup(ctx: PluginContext) {
    ctx.logger.info("Customer 360 plugin setup starting", {
      twentyConfigured:
        !!process.env.TWENTY_INTERNAL_URL && !!process.env.TWENTY_API_KEY,
    });

    ctx.tools.register(
      TOOL_NAMES.getCustomer,
      {
        displayName: "Customer 360: Get Customer",
        description: "Look up a customer by id, email or phone.",
        parametersSchema: {
          type: "object",
          properties: { identifier: { type: "string" } },
          required: ["identifier"],
        },
      },
      async (params, runCtx) => {
        const identifier = extractString(params, "identifier");
        if (!identifier) return { error: "`identifier` is required" };
        try {
          const record = await serviceFor(runCtx.companyId).getCustomer(identifier);
          if (!record) return { content: "Customer not found.", data: null };
          return { content: `Found customer ${record.name}.`, data: record };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.createCustomer,
      {
        displayName: "Customer 360: Create Customer",
        description: "Create a new customer record.",
        parametersSchema: {
          type: "object",
          properties: {
            name: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            company: { type: "string" },
            notes: { type: "string" },
          },
          required: ["name"],
        },
      },
      async (params, runCtx) => {
        const name = extractString(params, "name");
        if (!name) return { error: "`name` is required" };
        try {
          const record = await serviceFor(runCtx.companyId).createCustomer({
            name,
            email: extractString(params, "email"),
            phone: extractString(params, "phone"),
            company: extractString(params, "company"),
            notes: extractString(params, "notes"),
          });
          return { content: `Created customer ${record.name}.`, data: record };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.updateCustomer,
      {
        displayName: "Customer 360: Update Customer",
        description: "Patch a customer's profile fields.",
        parametersSchema: {
          type: "object",
          properties: {
            id: { type: "string" },
            fields: { type: "object" },
          },
          required: ["id", "fields"],
        },
      },
      async (params, runCtx) => {
        const id = extractString(params, "id");
        const fields = extractObject(params, "fields");
        if (!id) return { error: "`id` is required" };
        if (!fields) return { error: "`fields` is required" };
        try {
          const record = await serviceFor(runCtx.companyId).updateCustomer(id, fields as never);
          if (!record) return { error: `Customer ${id} not found` };
          return { content: `Updated customer ${record.name}.`, data: record };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.addNote,
      {
        displayName: "Customer 360: Add Note",
        description: "Append a free-form note to a customer's timeline.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            note: { type: "string" },
          },
          required: ["customerId", "note"],
        },
      },
      async (params, runCtx) => {
        const customerId = extractString(params, "customerId");
        const note = extractString(params, "note");
        if (!customerId) return { error: "`customerId` is required" };
        if (!note) return { error: "`note` is required" };
        try {
          const record = await serviceFor(runCtx.companyId).addNote(customerId, note);
          if (!record) return { error: `Customer ${customerId} not found` };
          return { content: "Note added.", data: record };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCustomerTimeline,
      {
        displayName: "Customer 360: Get Timeline",
        description: "Get the chronological timeline for a customer.",
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
          const timeline = await serviceFor(runCtx.companyId).getCustomerTimeline(customerId);
          return { content: `Timeline has ${timeline.length} entries.`, data: timeline };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCustomerSentiment,
      {
        displayName: "Customer 360: Get Sentiment",
        description: "Return sentiment score and label derived from the interaction history.",
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
          const sentiment = await serviceFor(runCtx.companyId).getCustomerSentiment(customerId);
          return { content: `Sentiment: ${sentiment.label}.`, data: sentiment };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.listCustomers,
      {
        displayName: "Customer 360: List Customers",
        description: "List customers for the current company.",
        parametersSchema: {
          type: "object",
          properties: {
            filter: { type: "string" },
            limit: { type: "number" },
          },
        },
      },
      async (params, runCtx) => {
        try {
          const rows = await serviceFor(runCtx.companyId).listCustomers(
            extractString(params, "filter"),
            extractNumber(params, "limit"),
          );
          return { content: `Found ${rows.length} customers.`, data: rows };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.searchCustomers,
      {
        displayName: "Customer 360: Search Customers",
        description: "Fuzzy search across name, email, phone and notes.",
        parametersSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
      async (params, runCtx) => {
        const query = extractString(params, "query");
        if (!query) return { error: "`query` is required" };
        try {
          const rows = await serviceFor(runCtx.companyId).searchCustomers(query);
          return { content: `Found ${rows.length} matches.`, data: rows };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getCustomerValue,
      {
        displayName: "Customer 360: Get Lifetime Value",
        description: "Return lifetime value and last interaction timestamp.",
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
          const value = await serviceFor(runCtx.companyId).getCustomerValue(customerId);
          if (!value) return { error: `Customer ${customerId} not found` };
          return { content: `Lifetime value $${value.lifetimeValue.toFixed(2)}.`, data: value };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.addInteraction,
      {
        displayName: "Customer 360: Add Interaction",
        description: "Log an interaction (email, call, meeting, etc.) on a customer.",
        parametersSchema: {
          type: "object",
          properties: {
            customerId: { type: "string" },
            type: { type: "string" },
            summary: { type: "string" },
            date: { type: "string" },
          },
          required: ["customerId", "type", "summary"],
        },
      },
      async (params, runCtx) => {
        const customerId = extractString(params, "customerId");
        const type = extractString(params, "type");
        const summary = extractString(params, "summary");
        if (!customerId || !type || !summary) {
          return { error: "`customerId`, `type` and `summary` are required" };
        }
        try {
          const record = await serviceFor(runCtx.companyId).addInteraction(customerId, {
            type,
            summary,
            date: extractString(params, "date"),
          });
          if (!record) return { error: `Customer ${customerId} not found` };
          return { content: "Interaction logged.", data: record };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getAtRiskCustomers,
      {
        displayName: "Customer 360: At-Risk Customers",
        description: "List customers flagged as at risk.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        try {
          const rows = await serviceFor(runCtx.companyId).getAtRiskCustomers();
          return { content: `${rows.length} at-risk customers.`, data: rows };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.tools.register(
      TOOL_NAMES.getTopCustomers,
      {
        displayName: "Customer 360: Top Customers",
        description: "List highest lifetime-value customers.",
        parametersSchema: {
          type: "object",
          properties: { limit: { type: "number" } },
        },
      },
      async (params, runCtx) => {
        try {
          const rows = await serviceFor(runCtx.companyId).getTopCustomers(
            extractNumber(params, "limit") ?? 10,
          );
          return { content: `Top ${rows.length} customers.`, data: rows };
        } catch (err) {
          return toolError(err);
        }
      },
    );
  },

  async onHealth() {
    return { status: "ok" };
  },
});

export default plugin;
