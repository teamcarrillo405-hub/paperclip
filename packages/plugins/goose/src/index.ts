export { default as manifest, PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./manifest.js";
export { default as worker } from "./worker.js";
export * from "./types.js";
export {
  GooseNotInstalledError,
  spawnGooseTask,
  type GooseExecutorOptions,
  type GooseRunningProcess,
} from "./goose-executor.js";
export {
  GooseService,
  type GooseServiceOptions,
  type GooseTaskPersistence,
} from "./goose-service.js";
export {
  TASK_TEMPLATES,
  TASK_TEMPLATE_NAMES,
  isTaskTemplateName,
  renderTemplate,
  type TaskTemplate,
} from "./task-templates.js";

import { execSync } from "node:child_process";
import { default as manifest } from "./manifest.js";
import { default as worker } from "./worker.js";
import { GooseService } from "./goose-service.js";

export function isGooseInstalled(binary = "goose"): boolean {
  try {
    execSync(`which ${binary}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export const GoosePlugin = {
  id: manifest.id,
  manifest,
  worker,
  service: (options: ConstructorParameters<typeof GooseService>[0] = {}) =>
    new GooseService(options),
  isInstalled: isGooseInstalled,
};
