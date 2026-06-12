import type { TranscriptEntry } from "@paperclipai/adapter-utils";

export function parseOllamaStdoutLine(line: string, ts: string): TranscriptEntry[] {
  const text = line.trim();
  if (!text) return [];

  try {
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const type = typeof parsed.type === "string" ? parsed.type : "";
    if (type === "init") {
      return [{
        kind: "init",
        ts,
        model: typeof parsed.model === "string" ? parsed.model : "ollama",
        sessionId: typeof parsed.sessionId === "string" ? parsed.sessionId : "",
      }];
    }
    if (type === "result") {
      return [{
        kind: "result",
        ts,
        text: typeof parsed.text === "string" ? parsed.text : "",
        inputTokens: typeof parsed.inputTokens === "number" ? parsed.inputTokens : 0,
        outputTokens: typeof parsed.outputTokens === "number" ? parsed.outputTokens : 0,
        cachedTokens: 0,
        costUsd: 0,
        subtype: "ollama",
        isError: false,
        errors: [],
      }];
    }
    if (type === "error") {
      return [{
        kind: "result",
        ts,
        text: typeof parsed.message === "string" ? parsed.message : "Ollama adapter error",
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        costUsd: 0,
        subtype: "ollama_error",
        isError: true,
        errors: [typeof parsed.message === "string" ? parsed.message : "Ollama adapter error"],
      }];
    }
  } catch {
    // Fall through to plain stdout.
  }

  return [{ kind: "stdout", ts, text: line }];
}
