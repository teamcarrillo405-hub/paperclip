import type { AdapterModel } from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_LOCAL_BASE_URL, models as fallbackModels } from "../index.js";

type OllamaTag = {
  name?: unknown;
  model?: unknown;
  details?: {
    parameter_size?: unknown;
    quantization_level?: unknown;
  };
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function labelForModel(tag: OllamaTag): string {
  const name = typeof tag.name === "string" ? tag.name : typeof tag.model === "string" ? tag.model : "";
  const parameterSize = typeof tag.details?.parameter_size === "string" ? tag.details.parameter_size : "";
  const quantization = typeof tag.details?.quantization_level === "string" ? tag.details.quantization_level : "";
  const suffix = [parameterSize, quantization].filter(Boolean).join(", ");
  return suffix ? `${name} (${suffix})` : name;
}

export async function discoverOllamaModels(
  options: { baseUrl?: string; signal?: AbortSignal } = {},
): Promise<AdapterModel[]> {
  const baseUrl = normalizeBaseUrl(options.baseUrl || DEFAULT_OLLAMA_LOCAL_BASE_URL);
  const response = await fetch(`${baseUrl}/api/tags`, {
    method: "GET",
    signal: options.signal,
  });
  if (!response.ok) {
    throw new Error(`Ollama model discovery failed: HTTP ${response.status}`);
  }
  const parsed = await response.json() as { models?: unknown };
  const tags = Array.isArray(parsed.models) ? parsed.models as OllamaTag[] : [];
  const discovered = tags
    .map((tag) => {
      const id = typeof tag.name === "string" ? tag.name : typeof tag.model === "string" ? tag.model : "";
      return id ? { id, label: labelForModel(tag) } : null;
    })
    .filter((entry): entry is AdapterModel => entry !== null);
  return discovered.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }));
}

export async function listOllamaModels(): Promise<AdapterModel[]> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);
    try {
      return await discoverOllamaModels({ signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  } catch {
    return fallbackModels;
  }
}
