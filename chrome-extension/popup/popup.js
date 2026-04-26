/**
 * Avero Enterprise — Popup Script
 *
 * Handles:
 *   - Loading saved settings from chrome.storage.sync
 *   - Saving updated settings
 *   - Live health check / connection status
 *   - "Open Dashboard" and "Toggle Sidebar" quick actions
 */

(function () {
  "use strict";

  // --------------------------------------------------------------------------
  // DOM refs
  // --------------------------------------------------------------------------

  const serverUrlInput  = document.getElementById("server-url");
  const companyIdInput  = document.getElementById("company-id");
  const apiTokenInput   = document.getElementById("api-token");
  const saveBtn         = document.getElementById("btn-save");
  const saveFeedback    = document.getElementById("save-feedback");
  const statusDot       = document.getElementById("status-dot");
  const statusText      = document.getElementById("status-text");
  const dashboardBtn    = document.getElementById("btn-dashboard");
  const toggleBtn       = document.getElementById("btn-toggle");

  // --------------------------------------------------------------------------
  // On load — populate form + ping server
  // --------------------------------------------------------------------------

  document.addEventListener("DOMContentLoaded", async () => {
    const config = await loadConfig();

    serverUrlInput.value = config.averoBaseUrl || "http://localhost:3100";
    companyIdInput.value = config.companyId    || "";
    apiTokenInput.value  = config.apiToken     || "";

    await checkConnection(config.averoBaseUrl || "http://localhost:3100");
  });

  // --------------------------------------------------------------------------
  // Save settings
  // --------------------------------------------------------------------------

  saveBtn.addEventListener("click", async () => {
    const averoBaseUrl = serverUrlInput.value.trim().replace(/\/$/, "");
    const companyId    = companyIdInput.value.trim();
    const apiToken     = apiTokenInput.value.trim();

    if (!averoBaseUrl) {
      showFeedback("Server URL is required.", false);
      return;
    }

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    await new Promise((resolve) => {
      chrome.storage.sync.set({ averoBaseUrl, companyId, apiToken }, resolve);
    });

    saveBtn.disabled = false;
    saveBtn.textContent = "Save Settings";
    showFeedback("Settings saved.", true);

    // Re-check connection with new URL
    await checkConnection(averoBaseUrl);
  });

  // --------------------------------------------------------------------------
  // Connection health check
  // --------------------------------------------------------------------------

  async function checkConnection(baseUrl) {
    setStatus("checking", "Checking connection...");

    try {
      const url = baseUrl.replace(/\/$/, "") + "/api/health";
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });

      if (res.ok) {
        let version = "";
        try {
          const data = await res.json();
          version = data.version ? ` v${data.version}` : "";
        } catch { /* ignore */ }
        setStatus("connected", `Connected${version}`);
      } else {
        setStatus("error", `Server error ${res.status}`);
      }
    } catch (err) {
      if (err.name === "TimeoutError" || err.name === "AbortError") {
        setStatus("error", "Connection timed out");
      } else {
        setStatus("error", "Cannot reach server");
      }
    }
  }

  function setStatus(state, message) {
    statusDot.className = "status-dot " + state;
    statusText.textContent = message;
  }

  // --------------------------------------------------------------------------
  // Quick actions
  // --------------------------------------------------------------------------

  dashboardBtn.addEventListener("click", async () => {
    const config = await loadConfig();
    const url = (config.averoBaseUrl || "http://localhost:3100").replace(/\/$/, "") + "/";
    chrome.tabs.create({ url });
  });

  toggleBtn.addEventListener("click", async () => {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id) return;

    chrome.tabs.sendMessage(activeTab.id, { type: "TOGGLE_SIDEBAR" }, () => {
      // Ignore errors if content script is not present on this page
      void chrome.runtime.lastError;
    });

    // Close popup after toggling
    window.close();
  });

  // --------------------------------------------------------------------------
  // Helpers
  // --------------------------------------------------------------------------

  function loadConfig() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(["averoBaseUrl", "companyId", "apiToken"], (items) => {
        resolve({
          averoBaseUrl: items.averoBaseUrl || "http://localhost:3100",
          companyId:    items.companyId    || "",
          apiToken:     items.apiToken     || "",
        });
      });
    });
  }

  function showFeedback(msg, success) {
    saveFeedback.textContent = msg;
    saveFeedback.style.color = success ? "#2e7d32" : "#c62828";
    setTimeout(() => { saveFeedback.textContent = ""; }, 2500);
  }
})();
