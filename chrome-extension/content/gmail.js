/**
 * Avero Enterprise — Gmail Content Script
 *
 * Injects the Avero sidebar into Gmail. Handles:
 *   - Draft Reply generation
 *   - Thread summarization
 *   - Task context generation
 *   - SPA navigation detection (URL / title changes)
 *   - Draggable sidebar header
 */

(function averoGmailMain() {
  "use strict";

  // Prevent double-injection
  if (window.__averoGmailLoaded) return;
  window.__averoGmailLoaded = true;

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  const SIDEBAR_ID = "avero-gmail-panel";
  const TRIGGER_BTN_ID = "avero-gmail-trigger";

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  let config = { averoBaseUrl: "http://localhost:3100", companyId: "", apiToken: "" };
  let sidebarVisible = false;

  // --------------------------------------------------------------------------
  // Bootstrap — wait for Gmail to fully render, then inject UI
  // --------------------------------------------------------------------------

  function waitForGmail(cb, attempts = 0) {
    const mainEl =
      document.querySelector('[role="main"]') ||
      document.querySelector(".aeJ") ||
      document.querySelector(".AO");

    if (mainEl) {
      cb();
      return;
    }

    if (attempts > 60) {
      console.warn("[Avero] Gmail main area not found after 60 attempts.");
      return;
    }

    setTimeout(() => waitForGmail(cb, attempts + 1), 500);
  }

  async function init() {
    config = await sendMessage({ type: "GET_CONFIG" });
    injectSidebar();
    injectTriggerButton();
    watchNavigation();
    listenForToggle();
  }

  waitForGmail(init);

  // --------------------------------------------------------------------------
  // Sidebar injection
  // --------------------------------------------------------------------------

  function injectSidebar() {
    if (document.getElementById(SIDEBAR_ID)) return;

    const panel = document.createElement("div");
    panel.id = SIDEBAR_ID;
    panel.className = "avero-sidebar avero-hidden";
    panel.innerHTML = `
      <div class="avero-sidebar-header" id="avero-header-drag">
        <span>&#11041; Avero</span>
        <button id="avero-close" title="Close Avero">&#10005;</button>
      </div>
      <div class="avero-sidebar-body" id="avero-gmail-body"></div>
    `;

    document.body.appendChild(panel);

    document.getElementById("avero-close").addEventListener("click", closeSidebar);
    makeDraggable(panel, document.getElementById("avero-header-drag"));
    renderSidebarContent();
  }

  function renderSidebarContent() {
    const body = document.getElementById("avero-gmail-body");
    if (!body) return;

    body.innerHTML = `
      <div class="avero-section">
        <strong>Draft Reply</strong>
        <textarea class="avero-textarea" id="avero-instructions"
          placeholder="e.g. Decline politely, suggest rescheduling..."></textarea>
        <button class="avero-btn" id="avero-draft">Generate Reply</button>
      </div>

      <div class="avero-section">
        <strong>Summarize Thread</strong>
        <button class="avero-btn-secondary" id="avero-summarize">Summarize This Thread</button>
      </div>

      <div class="avero-section">
        <strong>Create Task Context</strong>
        <input class="avero-input" id="avero-task-desc"
          placeholder="Describe the task from this email..." />
        <button class="avero-btn" id="avero-create-task">Generate Task Context</button>
      </div>

      <div id="avero-result" class="avero-result" style="display:none"></div>
    `;

    document.getElementById("avero-draft").addEventListener("click", handleDraftReply);
    document.getElementById("avero-summarize").addEventListener("click", handleSummarize);
    document.getElementById("avero-create-task").addEventListener("click", handleCreateTask);
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
    btn.addEventListener("click", toggleSidebar);

    // Style — float over Gmail's top-right area
    btn.style.cssText = `
      position: fixed;
      top: 14px;
      right: 16px;
      z-index: 999998;
    `;

    document.body.appendChild(btn);
  }

  // --------------------------------------------------------------------------
  // Sidebar visibility
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
    if (sidebarVisible) {
      closeSidebar();
    } else {
      openSidebar();
    }
  }

  // --------------------------------------------------------------------------
  // Listen for TOGGLE_SIDEBAR from popup / background
  // --------------------------------------------------------------------------

  function listenForToggle() {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === "TOGGLE_SIDEBAR") toggleSidebar();
    });
  }

  // --------------------------------------------------------------------------
  // SPA navigation detection
  // --------------------------------------------------------------------------

  let lastTitle = document.title;

  function watchNavigation() {
    const observer = new MutationObserver(() => {
      if (document.title !== lastTitle) {
        lastTitle = document.title;
        renderSidebarContent();
      }
    });

    observer.observe(document.querySelector("title") || document.head, {
      subtree: true,
      characterData: true,
      childList: true,
    });
  }

  // --------------------------------------------------------------------------
  // Helpers — extract Gmail thread data
  // --------------------------------------------------------------------------

  function getThreadSubject() {
    const h2 = document.querySelector(".hP");
    if (h2) return h2.textContent.trim();
    const title = document.title.replace(" - Gmail", "").replace(" - Google Mail", "").trim();
    return title || "Email thread";
  }

  function getMessageBodies() {
    const messages = Array.from(document.querySelectorAll(".a3s.aiL"));
    return messages
      .map((el) => el.innerText.trim())
      .filter(Boolean)
      .join("\n\n---\n\n");
  }

  // --------------------------------------------------------------------------
  // Action: Draft Reply
  // --------------------------------------------------------------------------

  async function handleDraftReply() {
    const instructions = document.getElementById("avero-instructions")?.value.trim();
    const subject = getThreadSubject();

    if (!config.companyId) {
      showResult("Please set your Company ID in the Avero extension popup first.", "error");
      return;
    }

    const btn = document.getElementById("avero-draft");
    setLoading(btn, true);

    const userPrompt = instructions
      ? `Write a professional email reply to the thread "${subject}". Instructions: ${instructions}`
      : `Write a professional email reply to the thread "${subject}".`;

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: subject,
        docType: "email",
        userPrompt,
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown error"), "error");
      return;
    }

    const draftText = res.data?.fullPrompt || res.data?.systemPrompt || JSON.stringify(res.data);
    showResult(draftText, "success", [
      {
        label: "Copy to Clipboard",
        onClick: () => copyToClipboard(draftText),
      },
      {
        label: "Open Compose",
        onClick: openComposeWithText.bind(null, draftText),
      },
    ]);
  }

  // --------------------------------------------------------------------------
  // Action: Summarize Thread
  // --------------------------------------------------------------------------

  async function handleSummarize() {
    const subject = getThreadSubject();
    const bodies = getMessageBodies();

    if (!config.companyId) {
      showResult("Please set your Company ID in the Avero extension popup first.", "error");
      return;
    }

    if (!bodies) {
      showResult("No email body text found. Open a thread first.", "error");
      return;
    }

    const btn = document.getElementById("avero-summarize");
    setLoading(btn, true);

    const truncated = bodies.slice(0, 4000);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: subject,
        docType: "meeting-summary",
        userPrompt: `Summarize the key points and any action items from this email thread:\n\n${truncated}`,
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown error"), "error");
      return;
    }

    const summaryText = res.data?.fullPrompt || JSON.stringify(res.data);
    showResult(summaryText, "success", [{ label: "Copy", onClick: () => copyToClipboard(summaryText) }]);
  }

  // --------------------------------------------------------------------------
  // Action: Create Task Context
  // --------------------------------------------------------------------------

  async function handleCreateTask() {
    const taskDesc = document.getElementById("avero-task-desc")?.value.trim();
    const subject = getThreadSubject();

    if (!config.companyId) {
      showResult("Please set your Company ID in the Avero extension popup first.", "error");
      return;
    }

    const combinedDesc = taskDesc
      ? `${taskDesc} (from email: "${subject}")`
      : `Task from email: "${subject}"`;

    const btn = document.getElementById("avero-create-task");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/context",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: combinedDesc,
        docType: "general",
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown error"), "error");
      return;
    }

    const ctxText =
      "System Prompt:\n" +
      (res.data?.systemPrompt || "") +
      "\n\nContext Docs:\n" +
      (res.data?.relevantDocs || []).map((d) => `• ${d.title}: ${d.excerpt}`).join("\n");

    showResult(ctxText, "success", [{ label: "Copy Context", onClick: () => copyToClipboard(ctxText) }]);
  }

  // --------------------------------------------------------------------------
  // Helpers — UI
  // --------------------------------------------------------------------------

  function showResult(text, type = "default", actions = []) {
    const el = document.getElementById("avero-result");
    if (!el) return;

    el.style.display = "block";
    el.className = "avero-result" + (type === "error" ? " avero-result-error" : type === "success" ? " avero-result-success" : "");
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

  function openComposeWithText(text) {
    // Click the Gmail compose button
    const composeBtn =
      document.querySelector(".T-I.T-I-KE.L3") ||
      document.querySelector("[data-tooltip='Compose']") ||
      document.querySelector("[gh='cm']");

    if (composeBtn) {
      composeBtn.click();
      // Wait for compose window, then insert text
      waitForEl(".Am.Al.editable", 3000).then((editable) => {
        if (editable) {
          editable.focus();
          document.execCommand("insertText", false, text);
        }
      });
    } else {
      copyToClipboard(text);
      alert("[Avero] Compose button not found. Draft text was copied to clipboard.");
    }
  }

  function waitForEl(selector, timeout = 2000) {
    return new Promise((resolve) => {
      const el = document.querySelector(selector);
      if (el) { resolve(el); return; }
      const observer = new MutationObserver(() => {
        const found = document.querySelector(selector);
        if (found) { observer.disconnect(); resolve(found); }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => { observer.disconnect(); resolve(null); }, timeout);
    });
  }

  // --------------------------------------------------------------------------
  // Draggable sidebar
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
      const dx = startX - e.clientX; // positive = dragging right → shrink right
      const newRight = Math.max(0, startRight + dx);
      panel.style.right = newRight + "px";
    }

    function onMouseUp() {
      dragging = false;
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    }
  }

  // --------------------------------------------------------------------------
  // Messaging helper
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
