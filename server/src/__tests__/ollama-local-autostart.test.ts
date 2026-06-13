import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  ensureOllamaServerRunning,
  isLoopbackOllamaUrl,
  resolveOllamaCommand,
} from "@paperclipai/adapter-ollama-local/server";

function response(ok: boolean): Response {
  return { ok } as Response;
}

describe("ollama local adapter auto-start", () => {
  it("recognizes loopback Ollama URLs", () => {
    expect(isLoopbackOllamaUrl("http://127.0.0.1:11434")).toBe(true);
    expect(isLoopbackOllamaUrl("http://localhost:11434")).toBe(true);
    expect(isLoopbackOllamaUrl("http://192.168.1.2:11434")).toBe(false);
  });

  it("uses configured command path before discovery", () => {
    expect(resolveOllamaCommand("C:/Tools/Ollama/ollama.exe")).toBe("C:/Tools/Ollama/ollama.exe");
  });

  it("does not spawn when Ollama is already reachable", async () => {
    const fetchImpl = vi.fn(async () => response(true));
    const spawnImpl = vi.fn();

    const result = await ensureOllamaServerRunning({
      baseUrl: "http://127.0.0.1:11434",
      autoStart: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      spawnImpl: spawnImpl as never,
      sleepImpl: async () => {},
    });

    expect(result.status).toBe("already_running");
    expect(spawnImpl).not.toHaveBeenCalled();
  });

  it("starts Ollama hidden and detached for loopback URLs", async () => {
    let attempts = 0;
    const fetchImpl = vi.fn(async () => response(++attempts >= 2));
    const child = new EventEmitter() as EventEmitter & { unref: () => void };
    child.unref = vi.fn();
    const spawnImpl = vi.fn(() => child);

    const result = await ensureOllamaServerRunning({
      baseUrl: "http://127.0.0.1:11434",
      autoStart: true,
      ollamaPath: "C:/Ollama/ollama.exe",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      spawnImpl: spawnImpl as never,
      sleepImpl: async () => {},
    });

    expect(result.status).toBe("started");
    expect(spawnImpl).toHaveBeenCalledWith(
      "C:/Ollama/ollama.exe",
      ["serve"],
      expect.objectContaining({
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      }),
    );
    expect(child.unref).toHaveBeenCalled();
  });

  it("skips auto-start for non-loopback URLs", async () => {
    const fetchImpl = vi.fn(async () => response(false));
    const spawnImpl = vi.fn();

    const result = await ensureOllamaServerRunning({
      baseUrl: "http://10.0.0.20:11434",
      autoStart: true,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      spawnImpl: spawnImpl as never,
      sleepImpl: async () => {},
    });

    expect(result.status).toBe("skipped_non_loopback");
    expect(spawnImpl).not.toHaveBeenCalled();
  });
});
