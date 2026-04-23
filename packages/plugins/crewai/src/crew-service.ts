import marketingCrew from "./crew-definitions/marketing-crew.json" with { type: "json" };
import operationsCrew from "./crew-definitions/operations-crew.json" with { type: "json" };
import salesCrew from "./crew-definitions/sales-crew.json" with { type: "json" };
import financeCrew from "./crew-definitions/finance-crew.json" with { type: "json" };
import { spawnCrewRun, type CrewExecutorHandle } from "./crew-executor.js";
import type {
  CrewDefinition,
  CrewExecutionResult,
  CrewRunSpawnOptions,
} from "./types.js";

const BUILT_IN_CREWS: CrewDefinition[] = [
  marketingCrew as CrewDefinition,
  operationsCrew as CrewDefinition,
  salesCrew as CrewDefinition,
  financeCrew as CrewDefinition,
];

export interface CrewRunHandle {
  id: string;
  handle: CrewExecutorHandle;
  done: Promise<CrewExecutionResult>;
}

export class CrewService {
  private readonly customCrews = new Map<string, CrewDefinition>();
  private readonly running = new Map<string, CrewExecutorHandle>();

  listCrews(): CrewDefinition[] {
    const builtIn = [...BUILT_IN_CREWS];
    const custom = Array.from(this.customCrews.values());
    return [...builtIn, ...custom];
  }

  getCrew(name: string): CrewDefinition | undefined {
    const lower = name.toLowerCase();
    return (
      BUILT_IN_CREWS.find((c) => c.name.toLowerCase() === lower) ??
      this.customCrews.get(lower)
    );
  }

  registerCustomCrew(definition: CrewDefinition): CrewDefinition {
    validateCrewDefinition(definition);
    this.customCrews.set(definition.name.toLowerCase(), definition);
    return definition;
  }

  startRun(
    runId: string,
    definition: CrewDefinition,
    inputs: Record<string, unknown>,
    opts?: CrewRunSpawnOptions,
  ): CrewRunHandle {
    const handle = spawnCrewRun(definition, inputs, opts);
    this.running.set(runId, handle);
    const done = handle.done.finally(() => this.running.delete(runId));
    return { id: runId, handle, done };
  }

  cancelRun(runId: string): boolean {
    const handle = this.running.get(runId);
    if (!handle) return false;
    handle.cancel();
    return true;
  }

  isRunning(runId: string): boolean {
    return this.running.has(runId);
  }
}

export function validateCrewDefinition(def: CrewDefinition): void {
  if (!def || typeof def !== "object") {
    throw new Error("Crew definition must be an object.");
  }
  if (!def.name || typeof def.name !== "string") {
    throw new Error("Crew definition requires a 'name' string.");
  }
  if (!def.goal || typeof def.goal !== "string") {
    throw new Error("Crew definition requires a 'goal' string.");
  }
  if (!Array.isArray(def.agents) || def.agents.length === 0) {
    throw new Error("Crew definition requires at least one agent.");
  }
  if (!Array.isArray(def.tasks) || def.tasks.length === 0) {
    throw new Error("Crew definition requires at least one task.");
  }
  const agentRoles = new Set(def.agents.map((a) => a.role));
  for (const task of def.tasks) {
    if (!task.agent || !agentRoles.has(task.agent)) {
      throw new Error(
        `Task references unknown agent role '${task.agent}'. Known roles: ${Array.from(agentRoles).join(", ")}`,
      );
    }
  }
}

export const crewService = new CrewService();
