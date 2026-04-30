import type { PaperclipPluginManifestV1 } from "@paperclipai/plugin-sdk";

export const PLUGIN_ID = "paperclip.gusto";
export const PLUGIN_VERSION = "0.1.0";

export const TOOL_NAMES = {
  listEmployees: "gusto_list_employees",
  getEmployee: "gusto_get_employee",
  listPayrolls: "gusto_list_payrolls",
  getPayroll: "gusto_get_payroll",
  getCompanyInfo: "gusto_get_company_info",
  listPaySchedules: "gusto_list_pay_schedules",
} as const;

const manifest: PaperclipPluginManifestV1 = {
  id: PLUGIN_ID,
  apiVersion: 1,
  version: PLUGIN_VERSION,
  displayName: "Gusto Payroll",
  description: "Connects agents to Gusto for employee data, payroll runs, and pay schedules.",
  author: "Avero AI",
  categories: ["connector", "automation"],
  capabilities: [
    "agent.tools.register",
    "plugin.state.read",
    "http.outbound",
    "activity.log.write",
  ],
  entrypoints: {
    worker: "./dist/worker.js",
  },
  tools: [
    {
      name: TOOL_NAMES.listEmployees,
      displayName: "Gusto: List Employees",
      description: "List all employees for the connected Gusto company. Optional filter by status (active or terminated).",
      parametersSchema: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "terminated"] },
        },
      },
    },
    {
      name: TOOL_NAMES.getEmployee,
      displayName: "Gusto: Get Employee",
      description: "Fetch a single employee by their Gusto UUID.",
      parametersSchema: {
        type: "object",
        properties: {
          employeeUuid: { type: "string" },
        },
        required: ["employeeUuid"],
      },
    },
    {
      name: TOOL_NAMES.listPayrolls,
      displayName: "Gusto: List Payrolls",
      description: "List payroll runs for the connected Gusto company. Optional filters: processed (boolean), limit.",
      parametersSchema: {
        type: "object",
        properties: {
          processed: { type: "boolean" },
          limit: { type: "number" },
        },
      },
    },
    {
      name: TOOL_NAMES.getPayroll,
      displayName: "Gusto: Get Payroll",
      description: "Fetch a single payroll run by its Gusto UUID.",
      parametersSchema: {
        type: "object",
        properties: {
          payrollUuid: { type: "string" },
        },
        required: ["payrollUuid"],
      },
    },
    {
      name: TOOL_NAMES.getCompanyInfo,
      displayName: "Gusto: Company Info",
      description: "Fetch the connected Gusto company's name, EIN, entity type, and employee count.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
    {
      name: TOOL_NAMES.listPaySchedules,
      displayName: "Gusto: List Pay Schedules",
      description: "List all pay schedules configured for the connected Gusto company.",
      parametersSchema: {
        type: "object",
        properties: {},
      },
    },
  ],
};

export default manifest;
