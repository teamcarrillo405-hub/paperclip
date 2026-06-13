import fs from "node:fs/promises";
import path from "node:path";
import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import {
  asBoolean,
  asNumber,
  asString,
  DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  ensureAbsoluteDirectory,
  joinPromptSections,
  parseObject,
  renderPaperclipWakePrompt,
  renderTemplate,
  stringifyPaperclipWakePayload,
} from "@paperclipai/adapter-utils/server-utils";
import {
  DEFAULT_OLLAMA_LOCAL_BASE_URL,
  DEFAULT_OLLAMA_LOCAL_MODEL,
} from "../index.js";
import { ensureOllamaServerRunning } from "./ollama-server.js";

type OllamaChatResponse = {
  message?: {
    content?: unknown;
  };
  prompt_eval_count?: unknown;
  eval_count?: unknown;
  total_duration?: unknown;
};

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

async function readInstructionsPrefix(instructionsFilePath: string): Promise<string> {
  const trimmed = instructionsFilePath.trim();
  if (!trimmed) return "";
  const content = await fs.readFile(trimmed, "utf8");
  return [
    `Instructions from ${path.basename(trimmed)}:`,
    content.trim(),
  ].filter(Boolean).join("\n");
}

function buildOptions(config: Record<string, unknown>): Record<string, unknown> {
  const options: Record<string, unknown> = {};
  const temperature = asNumber(config.temperature, Number.NaN);
  if (Number.isFinite(temperature)) options.temperature = temperature;
  const numCtx = asNumber(config.numCtx, Number.NaN);
  if (Number.isFinite(numCtx)) options.num_ctx = numCtx;
  return options;
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta } = ctx;
  const baseUrl = normalizeBaseUrl(asString(config.baseUrl, DEFAULT_OLLAMA_LOCAL_BASE_URL));
  const model = asString(config.model, DEFAULT_OLLAMA_LOCAL_MODEL).trim() || DEFAULT_OLLAMA_LOCAL_MODEL;
  const cwd = asString(config.cwd, process.cwd());
  const autoStart = asBoolean(config.autoStart, true);
  const ollamaPath = asString(config.ollamaPath, "");
  const startupTimeoutSec = Math.max(1, asNumber(config.startupTimeoutSec, 20));
  await ensureAbsoluteDirectory(cwd, { createIfMissing: true });

  const promptTemplate = asString(
    config.promptTemplate,
    DEFAULT_PAPERCLIP_AGENT_PROMPT_TEMPLATE,
  );
  const wakePayloadJson = stringifyPaperclipWakePayload(context.paperclipWake);
  const renderedPrompt = renderTemplate(promptTemplate, {
    runId,
    agent,
    runtime,
    context,
    wakePayloadJson,
  });
  const wakePrompt = renderPaperclipWakePrompt(context.paperclipWake);
  const instructionsPrefix = await readInstructionsPrefix(asString(config.instructionsFilePath, ""));
  const systemPrompt = joinPromptSections([
    instructionsPrefix,
    "You are running inside Paperclip through the local Ollama adapter.",
    "You do not have shell, browser, or filesystem tools. Produce concise text, analysis, classification, drafts, or handoff instructions.",
    "If the task requires publishing, API calls, browser work, file edits, or external actions, say it must be handed to Codex.",
  ]);
  const userPrompt = joinPromptSections([renderedPrompt, wakePrompt]);
  const timeoutSec = Math.max(1, asNumber(config.timeoutSec, 900));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

  let startupMessage = "";
  try {
    const startup = await ensureOllamaServerRunning({
      baseUrl,
      autoStart,
      ollamaPath,
      startupTimeoutMs: startupTimeoutSec * 1_000,
    });
    startupMessage = startup.message;
    await onLog("stdout", `${JSON.stringify({ type: "ollama_startup", ...startup })}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await onLog("stderr", `${JSON.stringify({ type: "error", message })}\n`);
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage: message,
      errorCode: "ollama_start_failed",
      provider: "ollama",
      biller: "local",
      model,
      billingType: "fixed",
      costUsd: 0,
    };
  }

  await onMeta?.({
    adapterType: "ollama_local",
    command: "ollama-http",
    cwd,
    commandArgs: ["POST", `${baseUrl}/api/chat`],
    commandNotes: ["Local Ollama HTTP API; no external model billing", startupMessage],
    prompt: userPrompt,
    promptMetrics: {
      characters: userPrompt.length,
      systemCharacters: systemPrompt.length,
    },
  });
  await onLog("stdout", `${JSON.stringify({ type: "init", model, sessionId: "" })}\n`);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        options: buildOptions(config),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      const message = `Ollama request failed: HTTP ${response.status}${detail ? ` ${detail}` : ""}`;
      await onLog("stderr", `${JSON.stringify({ type: "error", message })}\n`);
      return {
        exitCode: 1,
        signal: null,
        timedOut: false,
        errorMessage: message,
        errorCode: "ollama_request_failed",
        provider: "ollama",
        biller: "local",
        model,
        billingType: "fixed",
        costUsd: 0,
      };
    }

    const parsed = await response.json() as OllamaChatResponse;
    const text = typeof parsed.message?.content === "string" ? parsed.message.content : "";
    const inputTokens = typeof parsed.prompt_eval_count === "number" ? parsed.prompt_eval_count : 0;
    const outputTokens = typeof parsed.eval_count === "number" ? parsed.eval_count : 0;
    await onLog("stdout", `${JSON.stringify({ type: "result", text, inputTokens, outputTokens })}\n`);
    return {
      exitCode: 0,
      signal: null,
      timedOut: false,
      usage: { inputTokens, outputTokens },
      provider: "ollama",
      biller: "local",
      model,
      billingType: "fixed",
      costUsd: 0,
      summary: text.slice(0, 2_000),
      resultJson: {
        text,
        ...(typeof parsed.total_duration === "number" ? { totalDurationNs: parsed.total_duration } : {}),
      },
    };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    const message = timedOut
      ? `Ollama request timed out after ${timeoutSec}s.`
      : err instanceof Error ? err.message : String(err);
    await onLog("stderr", `${JSON.stringify({ type: "error", message })}\n`);
    return {
      exitCode: null,
      signal: timedOut ? "SIGTERM" : null,
      timedOut,
      errorMessage: message,
      errorCode: timedOut ? "ollama_timeout" : "ollama_request_failed",
      provider: "ollama",
      biller: "local",
      model,
      billingType: "fixed",
      costUsd: 0,
    };
  } finally {
    clearTimeout(timeout);
  }
}
