/**
 * Avero Enterprise — Google Docs Content Script
 *
 * Injects the Avero sidebar into Google Docs. Features:
 *   - Expand selected text
 *   - Generate a document section
 *   - Review full document for gaps
 *   - Ingest document to Avero knowledge base
 *   - Draggable sidebar, SPA-safe
 */

(function averoDocsMain() {
  "use strict";

  if (window.__averoDocsLoaded) return;
  window.__averoDocsLoaded = true;

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  const SIDEBAR_ID = "avero-docs-panel";
  const TRIGGER_BTN_ID = "avero-docs-trigger";

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  let config = { averoBaseUrl: "http://localhost:3100", companyId: "", apiToken: "" };
  let sidebarVisible = false;

  // --------------------------------------------------------------------------
  // Bootstrap
  // --------------------------------------------------------------------------

  function waitForDocs(cb, attempts = 0) {
    const target =
      document.querySelector(".kix-page-content-block") ||
      document.querySelector(".docs-editor") ||
      document.querySelector("#docs-editor-container");

    if (target) {
      cb();
      return;
    }

    if (attempts > 80) {
      console.warn("[Avero] Google Docs editor area not found.");
      return;
    }

    setTimeout(() => waitForDocs(cb, attempts + 1), 500);
  }

  async function init() {
    config = await sendMessage({ type: "GET_CONFIG" });
    injectSidebar();
    injectTriggerButton();
    listenForToggle();
  }

  waitForDocs(init);

  // --------------------------------------------------------------------------
  // Sidebar
  // --------------------------------------------------------------------------

  function injectSidebar() {
    if (document.getElementById(SIDEBAR_ID)) return;

    const panel = document.createElement("div");
    panel.id = SIDEBAR_ID;
    panel.className = "avero-sidebar avero-hidden";
    panel.innerHTML = `
      <div class="avero-sidebar-header" id="avero-docs-drag-handle">
        <span>&#11041; Avero</span>
        <button id="avero-docs-close" title="Close">&#10005;</button>
      </div>
      <div class="avero-sidebar-body" id="avero-docs-body"></div>
    `;

    document.body.appendChild(panel);

    document.getElementById("avero-docs-close").addEventListener("click", closeSidebar);
    makeDraggable(panel, document.getElementById("avero-docs-drag-handle"));
    renderContent();
  }

  function renderContent() {
    const body = document.getElementById("avero-docs-body");
    if (!body) return;

    body.innerHTML = `
      <!-- Section 1: Expand Selection -->
      <div class="avero-section">
        <strong>Expand Selection</strong>
        <p style="font-size:12px;color:#666;margin:0 0 8px">
          Select text in the doc, then click Expand.
        </p>
        <button class="avero-btn" id="avero-expand-btn">Expand Selected Text</button>
      </div>

      <!-- Section 2: Generate Section -->
      <div class="avero-section">
        <strong>Generate Section</strong>
        <input class="avero-input" id="avero-section-topic"
          placeholder="Section topic or heading..." />
        <select class="avero-select" id="avero-doc-type">
          <option value="report">Report</option>
          <option value="proposal">Proposal</option>
          <option value="general">Memo</option>
          <option value="email">Email</option>
        </select>
        <button class="avero-btn" id="avero-generate-section-btn">Generate</button>
      </div>

      <!-- Section 3: Review Document -->
      <div class="avero-section">
        <strong>Review Document</strong>
        <p style="font-size:12px;color:#666;margin:0 0 8px">
          Analyze the current document for gaps and improvements.
        </p>
        <button class="avero-btn-secondary" id="avero-review-btn">Review This Doc</button>
      </div>

      <!-- Section 4: Ingest to KB -->
      <div class="avero-section">
        <strong>Save to Knowledge Base</strong>
        <p style="font-size:12px;color:#666;margin:0 0 8px">
          Ingest this document into Avero for future context.
        </p>
        <button class="avero-btn-secondary" id="avero-ingest-btn">Save to Avero KB</button>
      </div>

      <div id="avero-docs-result" class="avero-result" style="display:none"></div>
    `;

    document.getElementById("avero-expand-btn").addEventListener("click", handleExpand);
    document.getElementById("avero-generate-section-btn").addEventListener("click", handleGenerateSection);
    document.getElementById("avero-review-btn").addEventListener("click", handleReview);
    document.getElementById("avero-ingest-btn").addEventListener("click", handleIngest);
  }

  // --------------------------------------------------------------------------
  // Trigger button
  // --------------------------------------------------------------------------

  function injectTriggerButton() {
    if (document.getElementById(TRIGGER_BTN_ID)) return;

    const btn = document.createElement("button");
    btn.id = TRIGGER_BTN_ID;
    btn.className = "avero-trigger-btn";
    btn.innerHTML = "&#11041; Avero";
    btn.title = "Open Avero AI assistant";
    btn.style.cssText = `
      position: fixed;
      top: 14px;
      right: 16px;
      z-index: 999998;
    `;
    btn.addEventListener("click", toggleSidebar);
    document.body.appendChild(btn);
  }

  // --------------------------------------------------------------------------
  // Visibility
  // --------------------------------------------------------------------------

  function openSidebar() {
    const panel = document.getElementById(SIDEBAR_ID);
    if (!panel) return;
    panel.classList.remove("avero-hidden");
    sidebarVisible = true;
  }

  function closeSidebar() {
    const panel = document.getElementById(SIDEBAR_ID);
    if (!panel) return;
    panel.classList.add("avero-hidden");
    sidebarVisible = false;
  }

  function toggleSidebar() {
    sidebarVisible ? closeSidebar() : openSidebar();
  }

  function listenForToggle() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "TOGGLE_SIDEBAR") toggleSidebar();
    });
  }

  // --------------------------------------------------------------------------
  // Doc text extraction
  // --------------------------------------------------------------------------

  function getDocTitle() {
    // Google Docs puts the title in the page title: "Document Name - Google Docs"
    return document.title.replace(/\s*[-|]\s*Google Docs$/i, "").trim() || "Untitled Document";
  }

  function getDocText(maxChars = 6000) {
    const blocks = Array.from(document.querySelectorAll(".kix-page-content-block"));
    if (blocks.length) {
      return blocks.map((b) => b.innerText).join("\n").slice(0, maxChars);
    }
    // Fallback: grab paragraphs from contenteditable
    const editor = document.querySelector(".kix-appview-editor");
    return editor ? editor.innerText.slice(0, maxChars) : "";
  }

  // --------------------------------------------------------------------------
  // Action: Expand Selection
  // --------------------------------------------------------------------------

  async function handleExpand() {
    const selectedText = window.getSelection()?.toString().trim();
    if (!selectedText) {
      showResult("Select some text in the document first, then click Expand.", "error");
      return;
    }

    if (!config.companyId) {
      showResult("Set your Company ID in the Avero popup first.", "error");
      return;
    }

    const btn = document.getElementById("avero-expand-btn");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: getDocTitle(),
        docType: "general",
        userPrompt: "Expand and elaborate on the following text, keeping the same tone and style:\n\n" + selectedText,
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown"), "error");
      return;
    }

    const text = res.data?.fullPrompt || JSON.stringify(res.data);
    showResult(text, "success", [{ label: "Copy", onClick: () => copyToClipboard(text) }]);
  }

  // --------------------------------------------------------------------------
  // Action: Generate Section
  // --------------------------------------------------------------------------

  async function handleGenerateSection() {
    const topic = document.getElementById("avero-section-topic")?.value.trim();
    const docType = document.getElementById("avero-doc-type")?.value || "general";

    if (!topic) {
      showResult("Enter a section topic first.", "error");
      return;
    }

    if (!config.companyId) {
      showResult("Set your Company ID in the Avero popup first.", "error");
      return;
    }

    const btn = document.getElementById("avero-generate-section-btn");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic,
        docType,
        userPrompt: `Write a complete ${docType} section about: ${topic}`,
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown"), "error");
      return;
    }

    const text = res.data?.fullPrompt || JSON.stringify(res.data);
    showResult(text, "success", [
      { label: "Copy to Clipboard", onClick: () => copyToClipboard(text) },
    ]);
  }

  // --------------------------------------------------------------------------
  // Action: Review Document
  // --------------------------------------------------------------------------

  async function handleReview() {
    if (!config.companyId) {
      showResult("Set your Company ID in the Avero popup first.", "error");
      return;
    }

    const docText = getDocText(3000);
    if (!docText.trim()) {
      showResult("Could not extract document text. Make sure the doc is open.", "error");
      return;
    }

    const btn = document.getElementById("avero-review-btn");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: getDocTitle(),
        docType: "report",
        userPrompt:
          "Review this document for gaps, missing sections, unclear language, and improvement opportunities. " +
          "Provide specific, actionable feedback:\n\n" + docText,
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown"), "error");
      return;
    }

    const reviewText = res.data?.fullPrompt || JSON.stringify(res.data);
    showResult(reviewText, "success", [
      { label: "Copy Review", onClick: () => copyToClipboard(reviewText) },
    ]);
  }

  // --------------------------------------------------------------------------
  // Action: Ingest to Knowledge Base
  // --------------------------------------------------------------------------

  async function handleIngest() {
    if (!config.companyId) {
      showResult("Set your Company ID in the Avero popup first.", "error");
      return;
    }

    const title = getDocTitle();
    const content = getDocText(10000);

    if (!content.trim()) {
      showResult("Could not extract document content.", "error");
      return;
    }

    const btn = document.getElementById("avero-ingest-btn");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/knowledge/ingest",
      method: "POST",
      body: {
        companyId: config.companyId,
        title,
        content,
        source: window.location.href,
        docType: "general",
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error saving to KB: " + (res.error || "Unknown"), "error");
      return;
    }

    showResult(`"${title}" saved to your Avero knowledge base.`, "success");
    sendMessage({
      type: "SHOW_NOTIFICATION",
      title: "Avero — Saved",
      message: `"${title}" added to knowledge base.`,
    });
  }

  // --------------------------------------------------------------------------
  // UI helpers
  // --------------------------------------------------------------------------

  function showResult(text, type = "default", actions = []) {
    const el = document.getElementById("avero-docs-result");
    if (!el) return;

    el.style.display = "block";
    el.className =
      "avero-result" +
      (type === "error" ? " avero-result-error" : type === "success" ? " avero-result-success" : "");
    el.textContent = text;

    if (actions.length) {
      const bar = document.createElement("div");
      bar.style.cssText = "margin-top:8px; display:flex; gap:6px; flex-wrap:wrap;";
      actions.forEach(({ label, onClick }) => {
        const b = document.createElement("button");
        b.className = "avero-btn-secondary avero-btn-sm";
        b.textContent = label;
        b.addEventListener("click", onClick);
        bar.appendChild(b);
      });
      el.appendChild(bar);
    }

    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function setLoading(btn, loading) {
    if (!btn) return;
    btn.disabled = loading;
    if (loading) {
      btn.dataset.origText = btn.textContent;
      btn.innerHTML = btn.dataset.origText + ' <span class="avero-loading"></span>';
    } else {
      btn.innerHTML = btn.dataset.origText || btn.textContent;
    }
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text).catch(() => {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    });
  }

  // --------------------------------------------------------------------------
  // Draggable
  // --------------------------------------------------------------------------

  function makeDraggable(panel, handle) {
    let dragging = false;
    let startX, startRight;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      startX = e.clientX;
      startRight = parseInt(window.getComputedStyle(panel).right, 10) || 0;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      e.preventDefault();
    });

    function onMouseMove(e) {
      if (!dragging) return;
      const dx = startX - e.clientX;
      panel.style.right = Math.max(0, startRight + dx) + "px";
    }

    function onMouseUp() {
      dragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  }

  // --------------------------------------------------------------------------
  // Message helper
  // --------------------------------------------------------------------------

  function sendMessage(msg) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage(msg, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }
})();
