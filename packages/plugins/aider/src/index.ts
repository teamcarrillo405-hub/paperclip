export { default as manifest, PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./manifest.js";
export { default as worker } from "./worker.js";
export * from "./types.js";
export * from "./aider-executor.js";
export * from "./git-manager.js";
export { AiderService, type AiderServiceOptions, type BranchAndFixResult } from "./aider-service.js";

import { AiderService } from "./aider-service.js";
import { default as manifest } from "./manifest.js";
import { default as worker } from "./worker.js";

/**
 * Aider plugin entry point. Exposes the manifest, the plugin worker (tool
 * definitions), and a convenience AiderService that can be used directly from
 * the server (e.g. by HTTP routes) without going through the plugin tool bus.
 */
export const AiderPlugin = {
  id: manifest.id,
  manifest,
  worker,
  service: (options: ConstructorParameters<typeof AiderService>[0] = {}) =>
    new AiderService(options),
};
