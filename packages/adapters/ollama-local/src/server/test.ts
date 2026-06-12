import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { asString, parseObject } from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_OLLAMA_LOCAL_BASE_URL,
  DEFAULT_OLLAMA_LOCAL_MODEL,
} from "../index.js";
import { discoverOllamaModels } from "./models.js";

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((check) => check.level === "error")) return "fail";
  if (checks.some((check) => check.level === "warn")) return "warn";
  return "pass";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = parseObject(ctx.config);
  const baseUrl = normalizeBaseUrl(asString(config.baseUrl, DEFAULT_OLLAMA_LOCAL_BASE_URL));
  const model = asString(config.model, DEFAULT_OLLAMA_LOCAL_MODEL).trim();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const discovered = await discoverOllamaModels({ baseUrl, signal: controller.signal });
    checks.push({
      code: "ollama_server_reachable",
      level: "info",
      message: `Ollama is reachable at ${baseUrl}`,
    });
    checks.push({
      code: "ollama_models_discovered",
      level: discovered.length > 0 ? "info" : "warn",
      message: `Discovered ${discovered.length} Ollama model(s).`,
      hint: discovered.length === 0 ? "Pull at least one Ollama model before using this adapter." : undefined,
    });
    if (model && discovered.length > 0) {
      const found = discovered.some((entry) => entry.id === model);
      checks.push({
        code: found ? "ollama_model_configured" : "ollama_model_missing",
        level: found ? "info" : "warn",
        message: found
          ? `Configured model is available: ${model}`
          : `Configured model was not found locally: ${model}`,
        hint: found ? undefined : "Run `ollama pull <model>` or choose a locally installed model.",
      });
    }
  } catch (err) {
    checks.push({
      code: "ollama_server_unreachable",
      level: "error",
      message: `Ollama is not reachable at ${baseUrl}`,
      detail: err instanceof Error ? err.message : String(err),
      hint: "Start Ollama and verify `ollama list` or GET /api/tags succeeds.",
    });
  } finally {
    clearTimeout(timeout);
  }

  return {
    adapterType: "ollama_local",
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
