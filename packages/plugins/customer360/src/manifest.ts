import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.customer360";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  getCustomer: "customer360_get_customer",
  createCustomer: "customer360_create_customer",
  updateCustomer: "customer360_update_customer",
  addNote: "customer360_add_note",
  getCustomerTimeline: "customer360_get_customer_timeline",
  getCustomerSentiment: "customer360_get_customer_sentiment",
  listCustomers: "customer360_list_customers",
  searchCustomers: "customer360_search_customers",
  getCustomerValue: "customer360_get_customer_value",
  addInteraction: "customer360_add_interaction",
  getAtRiskCustomers: "customer360_get_at_risk_customers",
  getTopCustomers: "customer360_get_top_customers",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Customer 360",
  description:
    "Persistent customer memory with lifetime value, sentiment, notes and timeline. Syncs to Twenty CRM when configured.",
  author: "Avero AI",
  categories: ["connector"],
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
      name: TOOL_NAMES.getCustomer,
      displayName: "Customer 360: Get Customer",
      description:
        "Look up a customer by id, email or phone. Returns the stored memory record.",
      parametersSchema: {
        type: "object",
        properties: { identifier: { type: "string" } },
        required: ["identifier"],
      },
    },
    {
      name: TOOL_NAMES.createCustomer,
      displayName: "Customer 360: Create Customer",
      description: "Create a new customer record and sync to Twenty CRM when available.",
      parametersSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          email: { type: "string" },
          phone: { type: "string" },
          company: { type: "string" },
          notes: { type: "string" },
        },
        required: ["name", "email", "phone"],
      },
    },
    {
      name: TOOL_NAMES.updateCustomer,
      displayName: "Customer 360: Update Customer",
      description: "Patch a customer's profile fields (name, email, phone, notes, etc.).",
      parametersSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          fields: { type: "object" },
        },
        required: ["id", "fields"],
      },
    },
    {
      name: TOOL_NAMES.addNote,
      displayName: "Customer 360: Add Note",
      description: "Append a free-form note to a customer's memory timeline.",
      parametersSchema: {
        type: "object",
        properties: {
          customerId: { type: "string" },
          note: { type: "string" },
        },
        required: ["customerId", "note"],
      },
    },
    {
      name: TOOL_NAMES.getCustomerTimeline,
      displayName: "Customer 360: Get Timeline",
      description: "Get the chronological timeline of notes and interactions for a customer.",
      parametersSchema: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
    },
    {
      name: TOOL_NAMES.getCustomerSentiment,
      displayName: "Customer 360: Get Sentiment",
      description: "Return the stored sentiment score and a short qualitative label.",
      parametersSchema: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
    },
    {
      name: TOOL_NAMES.listCustomers,
      displayName: "Customer 360: List Customers",
      description: "List customers, optionally filtered by a substring and limited.",
      parametersSchema: {
        type: "object",
        properties: {
          filter: { type: "string" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: TOOL_NAMES.searchCustomers,
      displayName: "Customer 360: Search Customers",
      description: "Fuzzy search across name, email, phone and notes.",
      parametersSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    },
    {
      name: TOOL_NAMES.getCustomerValue,
      displayName: "Customer 360: Get Lifetime Value",
      description: "Return the stored lifetime value for a customer.",
      parametersSchema: {
        type: "object",
        properties: { customerId: { type: "string" } },
        required: ["customerId"],
      },
    },
    {
      name: TOOL_NAMES.addInteraction,
      displayName: "Customer 360: Add Interaction",
      description:
        "Log an interaction (email, call, meeting, etc.) on a customer's timeline.",
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
    {
      name: TOOL_NAMES.getAtRiskCustomers,
      displayName: "Customer 360: At-Risk Customers",
      description:
        "List customers flagged as at risk based on low sentiment or long silence.",
      parametersSchema: { type: "object", properties: {} },
    },
    {
      name: TOOL_NAMES.getTopCustomers,
      displayName: "Customer 360: Top Customers",
      description: "List highest lifetime-value customers.",
      parametersSchema: {
        type: "object",
        properties: { limit: { type: "number" } },
      },
    },
  ],
};

export default manifest;
