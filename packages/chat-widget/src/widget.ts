import { WidgetApiClient } from "./api-client.js";
import { iframeDocumentStyles, widgetHostStyles } from "./styles.js";
import type { ChatMessage, WidgetConfig } from "./types.js";

const SESSION_STORAGE_KEY_PREFIX = "avero-chat-session:";

export class ChatWidget {
  private readonly api: WidgetApiClient;
  private readonly companyId: string;
  private config: WidgetConfig | null = null;
  private root: HTMLDivElement | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private bubble: HTMLButtonElement | null = null;
  private sessionId: string | null = null;
  private leadCaptured = false;
  private messages: ChatMessage[] = [];
  private isOpen = false;
  private sending = false;

  constructor(companyId: string, apiBaseUrl: string) {
    this.companyId = companyId;
    this.api = new WidgetApiClient(companyId, apiBaseUrl);
  }

  async init(): Promise<void> {
    try {
      this.config = await this.api.getConfig();
    } catch (err) {
      console.warn("[avero-chat] failed to load config", err);
      return;
    }
    this.restoreSession();
    this.mountHost();
  }

  open(): void {
    if (!this.iframe) return;
    this.iframe.classList.add("open");
    this.isOpen = true;
    void this.ensureSession();
  }

  close(): void {
    if (!this.iframe) return;
    this.iframe.classList.remove("open");
    this.isOpen = false;
  }

  toggle(): void {
    this.isOpen ? this.close() : this.open();
  }

  private storageKey(): string {
    return `${SESSION_STORAGE_KEY_PREFIX}${this.companyId}`;
  }

  private restoreSession(): void {
    try {
      const raw = window.localStorage.getItem(this.storageKey());
      if (!raw) return;
      const parsed = JSON.parse(raw) as { sessionId?: string; leadCaptured?: boolean };
      if (parsed.sessionId) this.sessionId = parsed.sessionId;
      if (parsed.leadCaptured) this.leadCaptured = true;
    } catch {
      /* ignore corrupted state */
    }
  }

  private persistSession(): void {
    try {
      window.localStorage.setItem(
        this.storageKey(),
        JSON.stringify({ sessionId: this.sessionId, leadCaptured: this.leadCaptured }),
      );
    } catch {
      /* ignore quota errors */
    }
  }

  private mountHost(): void {
    if (!this.config) return;
    const root = document.createElement("div");
    root.className = "avero-chat-root";
    const style = document.createElement("style");
    style.textContent = widgetHostStyles();
    root.appendChild(style);

    const bubble = document.createElement("button");
    bubble.className = "avero-chat-bubble";
    bubble.setAttribute("aria-label", "Open chat");
    bubble.style.backgroundColor = this.config.brandColor;
    bubble.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
    bubble.addEventListener("click", () => this.toggle());

    const frame = document.createElement("iframe");
    frame.className = "avero-chat-frame";
    frame.title = "Chat";
    frame.setAttribute("aria-label", "Chat window");

    root.appendChild(frame);
    root.appendChild(bubble);
    document.body.appendChild(root);

    this.root = root;
    this.iframe = frame;
    this.bubble = bubble;
    this.renderIframe();
  }

  private renderIframe(): void {
    if (!this.iframe || !this.config) return;
    const doc = this.iframe.contentDocument;
    if (!doc) {
      // Iframes may not have a content document until attached — retry shortly.
      setTimeout(() => this.renderIframe(), 50);
      return;
    }
    doc.open();
    doc.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${iframeDocumentStyles(this.config.brandColor)}</style></head><body><div id="app"></div></body></html>`);
    doc.close();
    this.paintIframe();
  }

  private paintIframe(): void {
    if (!this.iframe || !this.config) return;
    const doc = this.iframe.contentDocument;
    if (!doc) return;
    const app = doc.getElementById("app");
    if (!app) return;
    app.innerHTML = "";

    const container = doc.createElement("div");
    container.className = "chat-app";

    container.appendChild(this.renderHeader(doc));
    const body = this.renderBody(doc);
    container.appendChild(body);
    container.appendChild(this.renderFooter(doc));

    app.appendChild(container);
    body.scrollTop = body.scrollHeight;
  }

  private renderHeader(doc: Document): HTMLElement {
    const cfg = this.config!;
    const header = doc.createElement("div");
    header.className = "chat-header";

    const avatar = doc.createElement("div");
    avatar.className = "chat-avatar";
    avatar.textContent = (cfg.agentName || "A").slice(0, 1).toUpperCase();
    header.appendChild(avatar);

    const titleWrap = doc.createElement("div");
    const title = doc.createElement("div");
    title.className = "chat-title";
    title.textContent = cfg.agentName;
    const subtitle = doc.createElement("div");
    subtitle.className = "chat-subtitle";
    subtitle.textContent = "Online";
    titleWrap.appendChild(title);
    titleWrap.appendChild(subtitle);
    header.appendChild(titleWrap);

    const closeBtn = doc.createElement("button");
    closeBtn.className = "chat-close";
    closeBtn.setAttribute("aria-label", "Close chat");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.close());
    header.appendChild(closeBtn);

    return header;
  }

  private renderBody(doc: Document): HTMLElement {
    const body = doc.createElement("div");
    body.className = "chat-body";
    const cfg = this.config!;

    if (this.messages.length === 0) {
      const welcome: ChatMessage = {
        role: "agent",
        content: cfg.welcomeMessage,
        createdAt: new Date().toISOString(),
      };
      body.appendChild(this.renderMessage(doc, welcome));
    } else {
      for (const m of this.messages) {
        body.appendChild(this.renderMessage(doc, m));
      }
    }
    if (this.sending) {
      const typing = doc.createElement("div");
      typing.className = "typing";
      typing.innerHTML = "<span></span><span></span><span></span>";
      body.appendChild(typing);
    }
    return body;
  }

  private renderMessage(doc: Document, m: ChatMessage): HTMLElement {
    const el = doc.createElement("div");
    el.className = `msg msg-${m.role}`;
    el.textContent = m.content;
    return el;
  }

  private renderFooter(doc: Document): HTMLElement {
    const footer = doc.createElement("div");
    footer.className = "chat-footer";
    const cfg = this.config!;

    if (!this.leadCaptured) {
      footer.appendChild(this.renderLeadForm(doc));
    } else {
      footer.appendChild(this.renderCompose(doc));
    }

    const branding = doc.createElement("div");
    branding.className = "branding";
    branding.textContent = `Powered by ${cfg.agentName}`;
    footer.appendChild(branding);

    return footer;
  }

  private renderLeadForm(doc: Document): HTMLElement {
    const cfg = this.config!;
    const form = doc.createElement("form");
    form.className = "lead-form";

    const intro = doc.createElement("p");
    intro.textContent = "Before we get started, can you share your details?";
    form.appendChild(intro);

    const nameInput = doc.createElement("input");
    nameInput.type = "text";
    nameInput.name = "name";
    nameInput.placeholder = "Your name";
    nameInput.required = true;
    form.appendChild(nameInput);

    let emailInput: HTMLInputElement | null = null;
    if (cfg.collectEmail) {
      emailInput = doc.createElement("input");
      emailInput.type = "email";
      emailInput.name = "email";
      emailInput.placeholder = "Email";
      emailInput.required = true;
      form.appendChild(emailInput);
    }

    let phoneInput: HTMLInputElement | null = null;
    if (cfg.collectPhone) {
      phoneInput = doc.createElement("input");
      phoneInput.type = "tel";
      phoneInput.name = "phone";
      phoneInput.placeholder = "Phone (optional)";
      form.appendChild(phoneInput);
    }

    const err = doc.createElement("p");
    err.className = "error";
    err.style.display = "none";
    form.appendChild(err);

    const submit = doc.createElement("button");
    submit.type = "submit";
    submit.className = "btn-primary";
    submit.textContent = "Start chat";
    form.appendChild(submit);

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      submit.disabled = true;
      err.style.display = "none";
      const name = nameInput.value.trim();
      const email = emailInput?.value.trim() ?? "";
      const phone = phoneInput?.value.trim() ?? "";
      if (!name) {
        err.textContent = "Please enter your name";
        err.style.display = "block";
        submit.disabled = false;
        return;
      }
      try {
        await this.ensureSession();
        if (!this.sessionId) throw new Error("no session");
        await this.api.saveLead(this.sessionId, {
          name,
          email: email || undefined,
          phone: phone || undefined,
        });
        this.leadCaptured = true;
        this.persistSession();
        this.paintIframe();
      } catch (e2) {
        console.warn("[avero-chat] lead save failed", e2);
        err.textContent = "Could not save — please try again";
        err.style.display = "block";
        submit.disabled = false;
      }
    });

    return form;
  }

  private renderCompose(doc: Document): HTMLElement {
    const wrap = doc.createElement("form");
    wrap.className = "compose";

    const textarea = doc.createElement("textarea");
    textarea.placeholder = "Type a message…";
    textarea.rows = 1;
    textarea.disabled = this.sending;
    wrap.appendChild(textarea);

    const send = doc.createElement("button");
    send.type = "submit";
    send.className = "btn-primary";
    send.textContent = "Send";
    send.disabled = this.sending;
    wrap.appendChild(send);

    textarea.addEventListener("keydown", (e) => {
      const evt = e as KeyboardEvent;
      if (evt.key === "Enter" && !evt.shiftKey) {
        evt.preventDefault();
        wrap.dispatchEvent(new Event("submit", { cancelable: true }));
      }
    });

    wrap.addEventListener("submit", async (e) => {
      e.preventDefault();
      const content = textarea.value.trim();
      if (!content || this.sending) return;
      await this.sendMessage(content);
      textarea.value = "";
    });

    setTimeout(() => textarea.focus(), 50);
    return wrap;
  }

  private async ensureSession(): Promise<void> {
    if (this.sessionId) return;
    try {
      const { sessionId } = await this.api.createSession(window.location.href);
      this.sessionId = sessionId;
      this.persistSession();
    } catch (err) {
      console.warn("[avero-chat] session create failed", err);
    }
  }

  private async sendMessage(content: string): Promise<void> {
    await this.ensureSession();
    if (!this.sessionId) return;
    const visitorMsg: ChatMessage = { role: "visitor", content, createdAt: new Date().toISOString() };
    this.messages.push(visitorMsg);
    this.sending = true;
    this.paintIframe();
    try {
      const res = await this.api.sendMessage(this.sessionId, content);
      if (res.messages && Array.isArray(res.messages)) {
        this.messages = res.messages;
      } else {
        this.messages.push({
          role: "agent",
          content: res.reply,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      console.warn("[avero-chat] send failed", err);
      this.messages.push({
        role: "system",
        content: "Message could not be delivered. Please try again.",
        createdAt: new Date().toISOString(),
      });
    } finally {
      this.sending = false;
      this.paintIframe();
    }
  }
}
