import type { CreateConfigValues } from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_LOCAL_BASE_URL, DEFAULT_OLLAMA_LOCAL_MODEL } from "../index.js";

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

export function buildOllamaLocalConfig(v: CreateConfigValues): Record<string, unknown> {
  const schemaValues =
    typeof v.adapterSchemaValues === "object" && v.adapterSchemaValues !== null
      ? v.adapterSchemaValues
      : {};
  const ac: Record<string, unknown> = {};
  if (v.cwd) ac.cwd = v.cwd;
  if (v.instructionsFilePath) ac.instructionsFilePath = v.instructionsFilePath;
  if (v.promptTemplate) ac.promptTemplate = v.promptTemplate;
  if (v.bootstrapPrompt) ac.bootstrapPromptTemplate = v.bootstrapPrompt;
  const baseUrl = typeof schemaValues.baseUrl === "string" ? schemaValues.baseUrl.trim() : "";
  ac.baseUrl = baseUrl || DEFAULT_OLLAMA_LOCAL_BASE_URL;
  ac.model = v.model || DEFAULT_OLLAMA_LOCAL_MODEL;
  const temperature = parseNumber(schemaValues.temperature);
  if (temperature !== null) ac.temperature = temperature;
  const numCtx = parseNumber(schemaValues.numCtx);
  if (numCtx !== null) ac.numCtx = numCtx;
  ac.timeoutSec = 900;
  return ac;
}
