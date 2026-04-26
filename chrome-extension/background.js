/**
 * Avero Enterprise — Background Service Worker (Manifest V3)
 *
 * Responsibilities:
 *   - Config storage via chrome.storage.sync
 *   - Context menu "Send to Avero" on selected text
 *   - Message routing: proxies fetch calls from content scripts
 *     (content scripts cannot make cross-origin requests in MV3)
 *   - Notifications
 */

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG = {
  averoBaseUrl: "http://localhost:3100",
  companyId: "",
  apiToken: "",
};

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(["averoBaseUrl", "companyId", "apiToken"], (items) => {
      resolve({
        averoBaseUrl: items.averoBaseUrl || DEFAULT_CONFIG.averoBaseUrl,
        companyId: items.companyId || DEFAULT_CONFIG.companyId,
        apiToken: items.apiToken || DEFAULT_CONFIG.apiToken,
      });
    });
  });
}

async function setConfig(updates) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(updates, resolve);
  });
}

// ---------------------------------------------------------------------------
// Context menu — "Send to Avero"
// ---------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "avero-send-to-kb",
    title: 'Send to Avero Knowledge Base',
    contexts: ["selection"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "avero-send-to-kb") return;

  const selectedText = info.selectionText || "";
  if (!selectedText.trim()) return;

  const config = await getConfig();
  if (!config.companyId) {
    showNotification("Avero — Not Configured", "Set your Company ID in the extension popup first.");
    return;
  }

  try {
    const pageTitle = tab?.title || "Web selection";
    const result = await averoFetch(config, "/api/knowledge/ingest", "POST", {
      companyId: config.companyId,
      title: pageTitle,
      content: selectedText,
      source: tab?.url || "",
      docType: "general",
    });

    if (result.ok) {
      showNotification("Avero — Saved", `"${pageTitle.slice(0, 60)}" added to your knowledge base.`);
    } else {
      showNotification("Avero — Error", result.error || "Failed to save to knowledge base.");
    }
  } catch (err) {
    showNotification("Avero — Error", String(err));
  }
});

// ---------------------------------------------------------------------------
// Core fetch helper
// ---------------------------------------------------------------------------

async function averoFetch(config, path, method = "GET", body = null) {
  const url = config.averoBaseUrl.replace(/\/$/, "") + path;

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  // Attach bearer token when configured
  if (config.apiToken) {
    headers["Authorization"] = `Bearer ${config.apiToken}`;
  }

  const opts = {
    method,
    headers,
    credentials: "include",
  };

  if (body && method !== "GET") {
    opts.body = JSON.stringify(body);
  }

  try {
    const res = await fetch(url, opts);
    let data;
    try {
      data = await res.json();
    } catch {
      data = { _raw: await res.text() };
    }

    if (!res.ok) {
      return {
        ok: false,
        error: data?.error || data?.message || `HTTP ${res.status}`,
        status: res.status,
        data,
      };
    }

    return { ok: true, data, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err), status: 0 };
  }
}

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------

function showNotification(title, message) {
  chrome.notifications.create(`avero-${Date.now()}`, {
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message,
  });
}

// ---------------------------------------------------------------------------
// Message router — called by content scripts
// ---------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // ----- Avero API proxy request -----
  if (msg.type === "AVERO_REQUEST") {
    (async () => {
      const config = await getConfig();
      const result = await averoFetch(config, msg.path, msg.method || "GET", msg.body || null);
      sendResponse(result);
    })();
    return true; // keep message channel open for async response
  }

  // ----- Return current config to content scripts -----
  if (msg.type === "GET_CONFIG") {
    getConfig().then((config) => sendResponse(config));
    return true;
  }

  // ----- Save config from popup -----
  if (msg.type === "SET_CONFIG") {
    setConfig(msg.config).then(() => sendResponse({ ok: true }));
    return true;
  }

  // ----- Show a Chrome notification -----
  if (msg.type === "SHOW_NOTIFICATION") {
    showNotification(msg.title || "Avero", msg.message || "");
    sendResponse({ ok: true });
    return false;
  }

  // ----- Ping health check -----
  if (msg.type === "PING_HEALTH") {
    (async () => {
      const config = await getConfig();
      const result = await averoFetch(config, "/api/health", "GET");
      sendResponse(result);
    })();
    return true;
  }

  // ----- Toggle sidebar in active tab -----
  if (msg.type === "TOGGLE_SIDEBAR") {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_SIDEBAR" });
      }
    });
    sendResponse({ ok: true });
    return false;
  }

  return false;
});
