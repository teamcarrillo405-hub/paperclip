import {
  definePlugin,
  type ToolResult,
} from "@paperclipai/plugin-sdk";
import {
  GustoApiError,
  GustoNotConnectedError,
  createGustoClient,
  type GustoClient,
} from "./client.js";
import { TOOL_NAMES } from "./manifest.js";

function toolError(err: unknown): ToolResult {
  if (err instanceof GustoNotConnectedError) {
    return { error: err.message };
  }
  if (err instanceof GustoApiError) {
    return { error: err.message };
  }
  if (err instanceof Error) {
    return { error: `Gusto plugin error: ${err.message}` };
  }
  return { error: `Gusto plugin error: ${String(err)}` };
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

function extractBoolean(params: unknown, key: string): boolean | undefined {
  if (params && typeof params === "object") {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === "boolean") return v;
  }
  return undefined;
}

function extractStatus(params: unknown): "active" | "terminated" | undefined {
  const s = extractString(params, "status");
  if (s === "active" || s === "terminated") return s;
  return undefined;
}

const plugin = definePlugin({
  async setup(ctx) {
    ctx.logger.info("Gusto plugin setup starting");

    // -----------------------------------------------------------------------
    // gusto_list_employees
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.listEmployees,
      {
        displayName: "Gusto: List Employees",
        description: "List all employees for the connected Gusto company.",
        parametersSchema: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["active", "terminated"] },
          },
        },
      },
      async (params, runCtx) => {
        const client: GustoClient = createGustoClient(ctx, runCtx.companyId);
        try {
          const employees = await client.listEmployees(extractStatus(params));
          return {
            content: `Found ${employees.length} employee(s).`,
            data: employees,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // gusto_get_employee
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.getEmployee,
      {
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
      async (params, runCtx) => {
        const employeeUuid = extractString(params, "employeeUuid");
        if (!employeeUuid) return { error: "`employeeUuid` is required" };
        const client: GustoClient = createGustoClient(ctx, runCtx.companyId);
        try {
          const employee = await client.getEmployee(employeeUuid);
          return {
            content: `Employee: ${employee.first_name} ${employee.last_name} (${employee.employment_status}).`,
            data: employee,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // gusto_list_payrolls
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.listPayrolls,
      {
        displayName: "Gusto: List Payrolls",
        description: "List payroll runs for the connected Gusto company.",
        parametersSchema: {
          type: "object",
          properties: {
            processed: { type: "boolean" },
            limit: { type: "number" },
          },
        },
      },
      async (params, runCtx) => {
        const client: GustoClient = createGustoClient(ctx, runCtx.companyId);
        try {
          const payrolls = await client.listPayrolls({
            processed: extractBoolean(params, "processed"),
            limit: extractNumber(params, "limit"),
          });
          return {
            content: `Found ${payrolls.length} payroll run(s).`,
            data: payrolls,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // gusto_get_payroll
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.getPayroll,
      {
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
      async (params, runCtx) => {
        const payrollUuid = extractString(params, "payrollUuid");
        if (!payrollUuid) return { error: "`payrollUuid` is required" };
        const client: GustoClient = createGustoClient(ctx, runCtx.companyId);
        try {
          const payroll = await client.getPayroll(payrollUuid);
          const period = `${payroll.pay_period.start_date} → ${payroll.pay_period.end_date}`;
          const status = payroll.processed ? "processed" : "unprocessed";
          return {
            content: `Payroll ${period} (${status}).`,
            data: payroll,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // gusto_get_company_info
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.getCompanyInfo,
      {
        displayName: "Gusto: Company Info",
        description: "Fetch the connected Gusto company's name, EIN, entity type, and employee count.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        const client: GustoClient = createGustoClient(ctx, runCtx.companyId);
        try {
          const info = await client.getCompanyInfo();
          return {
            content: `Gusto company: ${info.name} (${info.number_of_employees} employees).`,
            data: info,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    // -----------------------------------------------------------------------
    // gusto_list_pay_schedules
    // -----------------------------------------------------------------------
    ctx.tools.register(
      TOOL_NAMES.listPaySchedules,
      {
        displayName: "Gusto: List Pay Schedules",
        description: "List all pay schedules configured for the connected Gusto company.",
        parametersSchema: { type: "object", properties: {} },
      },
      async (_params, runCtx) => {
        const client: GustoClient = createGustoClient(ctx, runCtx.companyId);
        try {
          const schedules = await client.listPaySchedules();
          return {
            content: `Found ${schedules.length} pay schedule(s).`,
            data: schedules,
          };
        } catch (err) {
          return toolError(err);
        }
      },
    );

    ctx.logger.info("Gusto plugin setup complete");
  },

  async onHealth() {
    const hasClientId =
      typeof process.env.GUSTO_CLIENT_ID === "string" &&
      process.env.GUSTO_CLIENT_ID.length > 0;
    const hasClientSecret =
      typeof process.env.GUSTO_CLIENT_SECRET === "string" &&
      process.env.GUSTO_CLIENT_SECRET.length > 0;
    if (!hasClientId || !hasClientSecret) {
      return {
        status: "degraded",
        message:
          "GUSTO_CLIENT_ID and/or GUSTO_CLIENT_SECRET environment variables are missing.",
      };
    }
    return { status: "ok", message: "Gusto plugin configured." };
  },
});

export default plugin;
