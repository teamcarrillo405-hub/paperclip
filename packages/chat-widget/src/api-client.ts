import type { ChatMessage, LeadPayload, WidgetConfig } from "./types.js";

export class WidgetApiClient {
  private readonly companyId: string;
  private readonly apiBase: string;

  constructor(companyId: string, apiBaseUrl: string) {
    this.companyId = companyId;
    this.apiBase = apiBaseUrl.replace(/\/$/, "");
  }

  private url(path: string): string {
    return `${this.apiBase}/api/widget/${encodeURIComponent(this.companyId)}${path}`;
  }

  async getConfig(): Promise<WidgetConfig> {
    const res = await fetch(this.url("/config"), { method: "GET" });
    if (!res.ok) throw new Error(`config request failed: ${res.status}`);
    const body = (await res.json()) as Partial<WidgetConfig> & { companyId?: string };
    return {
      companyId: this.companyId,
      apiBaseUrl: this.apiBase,
      welcomeMessage: body.welcomeMessage ?? "Hi! How can we help you today?",
      agentName: body.agentName ?? "Avero AI",
      brandColor: body.brandColor ?? "#2563eb",
      collectEmail: body.collectEmail ?? true,
      collectPhone: body.collectPhone ?? false,
    };
  }

  async createSession(pageUrl: string): Promise<{ sessionId: string }> {
    const res = await fetch(this.url("/session"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pageUrl }),
    });
    if (!res.ok) throw new Error(`session create failed: ${res.status}`);
    return (await res.json()) as { sessionId: string };
  }

  async sendMessage(sessionId: string, content: string): Promise<{ reply: string; messages: ChatMessage[] }> {
    const res = await fetch(this.url("/message"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, content }),
    });
    if (!res.ok) throw new Error(`message failed: ${res.status}`);
    return (await res.json()) as { reply: string; messages: ChatMessage[] };
  }

  async loadHistory(sessionId: string): Promise<{ messages: ChatMessage[] }> {
    const res = await fetch(this.url(`/history/${encodeURIComponent(sessionId)}`), {
      method: "GET",
    });
    if (!res.ok) throw new Error(`history failed: ${res.status}`);
    return (await res.json()) as { messages: ChatMessage[] };
  }

  async saveLead(sessionId: string, lead: LeadPayload): Promise<{ ok: true }> {
    const res = await fetch(this.url("/lead"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, ...lead }),
    });
    if (!res.ok) throw new Error(`lead failed: ${res.status}`);
    return (await res.json()) as { ok: true };
  }
}
