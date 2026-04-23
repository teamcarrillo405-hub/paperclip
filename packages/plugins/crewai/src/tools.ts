import { randomUUID } from "node:crypto";
import type {
  CrewDefinition,
  CrewExecutionResult,
  CrewRunRecord,
} from "./types.js";
import { crewService } from "./crew-service.js";

export interface AgentToolContext {
  companyId?: string;
  userId?: string;
}

export interface AgentTool<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  execute: (args: TArgs, ctx?: AgentToolContext) => Promise<TResult>;
}

export interface CrewRunStore {
  insert(record: CrewRunRecord): Promise<void>;
  update(id: string, patch: Partial<CrewRunRecord>): Promise<void>;
  getById(id: string): Promise<CrewRunRecord | null>;
  listByCompany(
    companyId: string,
    limit?: number,
  ): Promise<CrewRunRecord[]>;
}

const memoryStore: Map<string, CrewRunRecord> = new Map();

export const inMemoryCrewRunStore: CrewRunStore = {
  async insert(record) {
    memoryStore.set(record.id, record);
  },
  async update(id, patch) {
    const existing = memoryStore.get(id);
    if (!existing) return;
    memoryStore.set(id, { ...existing, ...patch });
  },
  async getById(id) {
    return memoryStore.get(id) ?? null;
  },
  async listByCompany(companyId, limit = 20) {
    return Array.from(memoryStore.values())
      .filter((r) => r.companyId === companyId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit);
  },
};

function toRecord(
  id: string,
  companyId: string,
  crew: CrewDefinition,
  inputs: Record<string, unknown>,
): CrewRunRecord {
  const now = new Date().toISOString();
  return {
    id,
    companyId,
    crewName: crew.name,
    inputs,
    status: "running",
    output: null,
    startedAt: now,
    completedAt: null,
    createdAt: now,
  };
}

function simulatedOutput(
  crew: CrewDefinition,
  inputs: Record<string, unknown>,
): string {
  const inputLines = Object.entries(inputs)
    .map(([k, v]) => `- ${k}: ${JSON.stringify(v)}`)
    .join("\n");
  const agents = crew.agents
    .map((a) => `- ${a.role}: ${a.goal}`)
    .join("\n");
  const tasks = crew.tasks
    .map((t, idx) => `${idx + 1}. (${t.agent}) ${t.description}`)
    .join("\n");
  return [
    `# Simulated crew output: ${crew.name}`,
    "",
    "CrewAI CLI is not installed — returning a simulated plan.",
    "",
    "## Inputs",
    inputLines || "(none)",
    "",
    "## Agents",
    agents,
    "",
    "## Tasks",
    tasks,
    "",
    "## Summary",
    `The crew would have executed ${crew.tasks.length} task(s) using ${crew.agents.length} agent(s) and returned consolidated output.`,
  ].join("\n");
}

export function createCrewToolkit(
  store: CrewRunStore = inMemoryCrewRunStore,
  opts: { simulateOnMissing?: boolean; timeoutMs?: number } = {},
): AgentTool[] {
  const simulateOnMissing = opts.simulateOnMissing ?? true;
  const timeoutMs = opts.timeoutMs ?? 120_000;

  async function runCrewAndPersist(
    crew: CrewDefinition,
    inputs: Record<string, unknown>,
    companyId: string,
  ): Promise<CrewRunRecord> {
    const id = randomUUID();
    const initial = toRecord(id, companyId, crew, inputs);
    await store.insert(initial);
    try {
      const handle = crewService.startRun(id, crew, inputs, { timeoutMs });
      const result: CrewExecutionResult = await handle.done;
      const completedAt = new Date().toISOString();
      const patch: Partial<CrewRunRecord> = {
        status: result.status === "succeeded" ? "succeeded" : "failed",
        output: result.output || result.error || null,
        completedAt,
      };
      await store.update(id, patch);
      return { ...initial, ...patch };
    } catch (err) {
      const completedAt = new Date().toISOString();
      const isMissing =
        (err as NodeJS.ErrnoException).code === "ENOENT" ||
        /not found|ENOENT/i.test(String(err));
      if (simulateOnMissing && isMissing) {
        const output = simulatedOutput(crew, inputs);
        const patch: Partial<CrewRunRecord> = {
          status: "succeeded",
          output,
          completedAt,
        };
        await store.update(id, patch);
        return { ...initial, ...patch };
      }
      const patch: Partial<CrewRunRecord> = {
        status: "failed",
        output: `Error: ${(err as Error).message}`,
        completedAt,
      };
      await store.update(id, patch);
      return { ...initial, ...patch };
    }
  }

  const tools: AgentTool[] = [
    {
      name: "list_crews",
      description: "List all available CrewAI crews (name + description).",
      parametersSchema: { type: "object", properties: {} },
      async execute() {
        return crewService.listCrews().map((c) => ({
          name: c.name,
          description: c.description ?? c.goal,
          agentCount: c.agents.length,
          taskCount: c.tasks.length,
        }));
      },
    },
    {
      name: "run_crew",
      description:
        "Run a CrewAI crew by name with a free-form input. Returns the runId and status.",
      parametersSchema: {
        type: "object",
        properties: {
          crewId: { type: "string", description: "Crew name" },
          input: {
            type: "string",
            description: "Free-form description of the task or inputs",
          },
        },
        required: ["crewId", "input"],
      },
      async execute(args, ctx) {
        const crewId = String((args as { crewId?: unknown }).crewId ?? "");
        const input = String((args as { input?: unknown }).input ?? "");
        const companyId = ctx?.companyId ?? "default";
        const crew = crewService.getCrew(crewId);
        if (!crew) throw new Error(`Unknown crew: ${crewId}`);
        const record = await runCrewAndPersist(crew, { input }, companyId);
        return { runId: record.id, status: record.status };
      },
    },
    {
      name: "get_crew_status",
      description: "Get the status of a crew run by runId.",
      parametersSchema: {
        type: "object",
        properties: { runId: { type: "string" } },
        required: ["runId"],
      },
      async execute(args) {
        const runId = String((args as { runId?: unknown }).runId ?? "");
        const rec = await store.getById(runId);
        if (!rec) throw new Error(`Run not found: ${runId}`);
        return {
          runId: rec.id,
          status: rec.status,
          crewName: rec.crewName,
          startedAt: rec.startedAt,
          completedAt: rec.completedAt,
        };
      },
    },
    {
      name: "get_crew_result",
      description: "Get the full output of a completed crew run.",
      parametersSchema: {
        type: "object",
        properties: { runId: { type: "string" } },
        required: ["runId"],
      },
      async execute(args) {
        const runId = String((args as { runId?: unknown }).runId ?? "");
        const rec = await store.getById(runId);
        if (!rec) throw new Error(`Run not found: ${runId}`);
        return { runId: rec.id, status: rec.status, output: rec.output };
      },
    },
    {
      name: "get_run_history",
      description: "List the most recent crew runs for the current company.",
      parametersSchema: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Max runs to return (default 10)" },
        },
      },
      async execute(args, ctx) {
        const limit = Number((args as { limit?: unknown }).limit ?? 10);
        const companyId = ctx?.companyId ?? "default";
        return store.listByCompany(companyId, limit);
      },
    },
    {
      name: "describe_crew",
      description:
        "Return the full definition (agents, tasks, input schema) of a crew by name.",
      parametersSchema: {
        type: "object",
        properties: { crewId: { type: "string" } },
        required: ["crewId"],
      },
      async execute(args) {
        const crewId = String((args as { crewId?: unknown }).crewId ?? "");
        const crew = crewService.getCrew(crewId);
        if (!crew) throw new Error(`Unknown crew: ${crewId}`);
        return crew;
      },
    },
  ];

  return tools;
}

export const crewAiTools: AgentTool[] = createCrewToolkit();
