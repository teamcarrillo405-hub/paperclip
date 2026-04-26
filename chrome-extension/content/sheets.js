/**
 * Avero Enterprise — Google Sheets Content Script
 *
 * Injects the Avero sidebar into Google Sheets. Features:
 *   - Formula Assistant (generate from plain-English description)
 *   - Explain Formula (from selected cell or user paste)
 *   - Data Summary (summarize the current sheet)
 *   - Draggable sidebar, SPA-safe
 */

(function averoSheetsMain() {
  "use strict";

  if (window.__averoSheetsLoaded) return;
  window.__averoSheetsLoaded = true;

  // --------------------------------------------------------------------------
  // Constants
  // --------------------------------------------------------------------------

  const SIDEBAR_ID = "avero-sheets-panel";
  const TRIGGER_BTN_ID = "avero-sheets-trigger";

  // --------------------------------------------------------------------------
  // State
  // --------------------------------------------------------------------------

  let config = { averoBaseUrl: "http://localhost:3100", companyId: "", apiToken: "" };
  let sidebarVisible = false;

  // --------------------------------------------------------------------------
  // Bootstrap
  // --------------------------------------------------------------------------

  function waitForSheets(cb, attempts = 0) {
    const target =
      document.querySelector(".grid-container") ||
      document.querySelector("#waffle-grid-container") ||
      document.querySelector(".waffle");

    if (target) {
      cb();
      return;
    }

    if (attempts > 80) {
      console.warn("[Avero] Google Sheets grid not found.");
      return;
    }

    setTimeout(() => waitForSheets(cb, attempts + 1), 500);
  }

  async function init() {
    config = await sendMessage({ type: "GET_CONFIG" });
    injectSidebar();
    injectTriggerButton();
    listenForToggle();
  }

  waitForSheets(init);

  // --------------------------------------------------------------------------
  // Sidebar
  // --------------------------------------------------------------------------

  function injectSidebar() {
    if (document.getElementById(SIDEBAR_ID)) return;

    const panel = document.createElement("div");
    panel.id = SIDEBAR_ID;
    panel.className = "avero-sidebar avero-hidden";
    panel.innerHTML = `
      <div class="avero-sidebar-header" id="avero-sheets-drag-handle">
        <span>&#11041; Avero</span>
        <button id="avero-sheets-close" title="Close">&#10005;</button>
      </div>
      <div class="avero-sidebar-body" id="avero-sheets-body"></div>
    `;

    document.body.appendChild(panel);

    document.getElementById("avero-sheets-close").addEventListener("click", closeSidebar);
    makeDraggable(panel, document.getElementById("avero-sheets-drag-handle"));
    renderContent();
  }

  function renderContent() {
    const body = document.getElementById("avero-sheets-body");
    if (!body) return;

    body.innerHTML = `
      <!-- Section 1: Formula Assistant -->
      <div class="avero-section">
        <strong>Formula Assistant</strong>
        <textarea class="avero-textarea" id="avero-formula-desc"
          placeholder="e.g. Sum column B only where column A says 'Active'..."></textarea>
        <button class="avero-btn" id="avero-gen-formula-btn">Generate Formula</button>
      </div>

      <!-- Section 2: Explain Formula -->
      <div class="avero-section">
        <strong>Explain Formula</strong>
        <p style="font-size:12px;color:#666;margin:0 0 8px">
          Click the button to auto-detect the selected cell's formula, or paste it below.
        </p>
        <button class="avero-btn-secondary" id="avero-detect-formula-btn">Detect Selected Cell</button>
        <input class="avero-input" id="avero-formula-input"
          placeholder="Paste formula here if auto-detect fails..." style="margin-top:8px" />
        <button class="avero-btn" id="avero-explain-formula-btn">Explain Formula</button>
      </div>

      <!-- Section 3: Data Summary -->
      <div class="avero-section">
        <strong>Data Summary</strong>
        <p style="font-size:12px;color:#666;margin:0 0 8px">
          Generate a plain-English summary of the current sheet.
        </p>
        <button class="avero-btn-secondary" id="avero-summarize-sheet-btn">Summarize This Sheet</button>
      </div>

      <div id="avero-sheets-result" class="avero-result" style="display:none"></div>
    `;

    document.getElementById("avero-gen-formula-btn").addEventListener("click", handleGenerateFormula);
    document.getElementById("avero-detect-formula-btn").addEventListener("click", handleDetectFormula);
    document.getElementById("avero-explain-formula-btn").addEventListener("click", handleExplainFormula);
    document.getElementById("avero-summarize-sheet-btn").addEventListener("click", handleSummarizeSheet);
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
  // Sheet metadata helpers
  // --------------------------------------------------------------------------

  function getSheetTitle() {
    return (
      document.title.replace(/\s*[-|]\s*Google Sheets$/i, "").trim() || "Untitled Spreadsheet"
    );
  }

  /**
   * Attempt to extract a cell range from the URL fragment.
   * Sheets URL fragment: #gid=0&range=B2 or #gid=0
   */
  function getRangeFromUrl() {
    const hash = window.location.hash; // e.g. #gid=0&range=B2
    const match = hash.match(/[?&]?range=([^&]+)/i);
    return match ? decodeURIComponent(match[1]) : null;
  }

  /**
   * Try to read the formula bar value — this is the most reliable way
   * to get the formula of the selected cell in Sheets.
   */
  function getFormulaBarValue() {
    // The formula bar input in Sheets
    const formulaBar =
      document.querySelector("#t-formula-bar-input") ||
      document.querySelector(".cell-input") ||
      document.querySelector("[id*='formula-bar']");

    if (formulaBar) {
      return (formulaBar.value || formulaBar.textContent || "").trim();
    }
    return "";
  }

  // --------------------------------------------------------------------------
  // Action: Generate Formula
  // --------------------------------------------------------------------------

  async function handleGenerateFormula() {
    const desc = document.getElementById("avero-formula-desc")?.value.trim();
    if (!desc) {
      showResult("Describe what you want the formula to calculate.", "error");
      return;
    }

    if (!config.companyId) {
      showResult("Set your Company ID in the Avero popup first.", "error");
      return;
    }

    const btn = document.getElementById("avero-gen-formula-btn");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: getSheetTitle(),
        docType: "general",
        userPrompt:
          "Write a Google Sheets formula that does the following. " +
          "Return ONLY the formula itself, starting with =, with no explanation or markdown:\n\n" +
          desc,
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown"), "error");
      return;
    }

    // Extract just the formula part from the response
    let formulaText = res.data?.fullPrompt || "";
    // Try to pull out just the = line if the response has extra text
    const formulaMatch = formulaText.match(/^=.+/m);
    const displayText = formulaMatch ? formulaMatch[0] : formulaText;

    showResult(displayText, "success", [
      { label: "Copy Formula", onClick: () => copyToClipboard(displayText) },
    ]);
  }

  // --------------------------------------------------------------------------
  // Action: Detect formula from selected cell
  // --------------------------------------------------------------------------

  function handleDetectFormula() {
    const formulaBarVal = getFormulaBarValue();
    const rangeFromUrl = getRangeFromUrl();

    const input = document.getElementById("avero-formula-input");
    if (!input) return;

    if (formulaBarVal) {
      input.value = formulaBarVal;
      showResult(`Detected: ${formulaBarVal}`, "success");
    } else if (rangeFromUrl) {
      showResult(
        `Selected range: ${rangeFromUrl}. Auto-detect could not read the cell value — paste the formula in the field above.`,
        "default"
      );
    } else {
      showResult(
        "Could not auto-detect the formula. Click a cell with a formula in Sheets, then try again — or paste the formula manually.",
        "error"
      );
    }
  }

  // --------------------------------------------------------------------------
  // Action: Explain Formula
  // --------------------------------------------------------------------------

  async function handleExplainFormula() {
    const formula = document.getElementById("avero-formula-input")?.value.trim();
    if (!formula) {
      showResult("Enter a formula to explain, or use Detect Selected Cell first.", "error");
      return;
    }

    if (!config.companyId) {
      showResult("Set your Company ID in the Avero popup first.", "error");
      return;
    }

    const btn = document.getElementById("avero-explain-formula-btn");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: "Formula explanation",
        docType: "general",
        userPrompt:
          "Explain what this Google Sheets formula does in plain English. " +
          "Break it down step by step:\n\n" + formula,
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown"), "error");
      return;
    }

    const explanationText = res.data?.fullPrompt || JSON.stringify(res.data);
    showResult(explanationText, "success", [
      { label: "Copy", onClick: () => copyToClipboard(explanationText) },
    ]);
  }

  // --------------------------------------------------------------------------
  // Action: Summarize Sheet
  // --------------------------------------------------------------------------

  async function handleSummarizeSheet() {
    if (!config.companyId) {
      showResult("Set your Company ID in the Avero popup first.", "error");
      return;
    }

    const sheetTitle = getSheetTitle();
    const btn = document.getElementById("avero-summarize-sheet-btn");
    setLoading(btn, true);

    const res = await sendMessage({
      type: "AVERO_REQUEST",
      path: "/api/writing/generate",
      method: "POST",
      body: {
        companyId: config.companyId,
        topic: sheetTitle,
        docType: "report",
        userPrompt:
          `Summarize the data in the spreadsheet titled "${sheetTitle}". ` +
          "Describe what kind of data it likely contains, its structure, and any key business insights " +
          "that would be valuable to a manager reviewing it.",
      },
    });

    setLoading(btn, false);

    if (!res.ok) {
      showResult("Error: " + (res.error || "Unknown"), "error");
      return;
    }

    const summaryText = res.data?.fullPrompt || JSON.stringify(res.data);
    showResult(summaryText, "success", [
      { label: "Copy Summary", onClick: () => copyToClipboard(summaryText) },
    ]);
  }

  // --------------------------------------------------------------------------
  // UI helpers
  // --------------------------------------------------------------------------

  function showResult(text, type = "default", actions = []) {
    const el = document.getElementById("avero-sheets-result");
    if (!el) return;

    el.style.display = "block";
    el.className =
      "avero-result" +
      (type === "error" ? " avero-result-error" : type === "success" ? " avero-result-success" : "");
    el.textContent = text;

    if (actions.length) {
      const bar = document.createElement("div");
      bar.style.cssText = "margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;";
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
      panel.style.right = Math.max(0, startRight + (startX - e.clientX)) + "px";
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
