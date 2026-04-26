# Avero Enterprise — Chrome Extension

Puts Avero AI directly inside Gmail, Google Docs, and Google Sheets.

## Quick Install (Developer Mode)

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** using the toggle in the top-right corner
3. Click **Load unpacked**
4. Select the `chrome-extension/` folder inside the paperclip repo
5. The Avero extension icon appears in your toolbar

## Configuration

1. Click the Avero toolbar icon
2. Set **Server URL** — defaults to `http://localhost:3100` for local dev; for production use your deployed Avero URL (must be HTTPS)
3. Set **Company ID** — found in your Avero dashboard settings
4. Set **API Token** — required only when your Avero instance runs in `authenticated` deployment mode (paste a board or agent bearer token)
5. Click **Save Settings**
6. The status indicator turns green when the server is reachable

## Using the Extension

### Gmail (`mail.google.com`)
- Look for the gold **⬡ Avero** button at the top-right of the page
- Click it to open the sidebar
- **Draft Reply** — describe how you want to respond; generates a professional reply draft
- **Summarize Thread** — condenses the full email thread into key points and action items
- **Create Task Context** — builds an Avero writing context from the thread for use in workflows
- Right-click any selected text anywhere → **Send to Avero Knowledge Base**

### Google Docs (`docs.google.com`)
- Click the **⬡ Avero** button (top-right)
- **Expand Selected Text** — select text in the doc, then click to elaborate it
- **Generate Section** — pick a topic and doc type to generate a full section
- **Review This Doc** — extracts visible document text and returns gap analysis
- **Save to Avero KB** — ingests the current document into your knowledge base

### Google Sheets (`sheets.google.com`)
- Click the **⬡ Avero** button (top-right)
- **Formula Assistant** — describe what you want in plain English, get back a `=FORMULA()`
- **Explain Formula** — auto-detects or accepts a pasted formula and explains it step by step
- **Summarize This Sheet** — generates a plain-English summary of what the sheet contains

## Updating

After pulling new code:
1. Go to `chrome://extensions/`
2. Find Avero Enterprise and click the **reload** icon (circular arrow)
3. Refresh any open Gmail/Docs/Sheets tabs

## Icon Files

The `icons/` folder contains generated gold placeholder PNGs (32x32 and 128x128).  
See `icons/placeholder.txt` for SVG source and instructions to produce polished icons.

## Known Limitations

- Avero server must be on `localhost` (HTTP allowed) or a public HTTPS domain
- Gmail, Docs, and Sheets are single-page apps — the extension handles SPA navigation via `MutationObserver` on `document.title`; occasional re-renders may require closing and re-opening the sidebar
- Google Docs text extraction reads `.kix-page-content-block` elements; very long documents are truncated to 3,000–10,000 characters per request
- Google Sheets formula auto-detection reads the formula bar DOM; if Sheets changes its internal selectors this may break — use the paste fallback
- Cross-origin fetch is handled via the background service worker; content scripts never make direct API calls

## Firefox Port

Manifest V3 is now supported in Firefox 109+. To port:
1. Replace `chrome.*` with `browser.*` (or use the `webextension-polyfill` shim)
2. Change `"type": "module"` in the background declaration to `"background": { "scripts": ["background.js"] }`
3. Load via `about:debugging` → This Firefox → Load Temporary Add-on

## Production: Chrome Web Store

1. Zip the entire `chrome-extension/` folder (not the parent)
2. Go to the [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
3. Pay the one-time $5 developer registration fee
4. Upload the ZIP and fill in store listing details
5. Submit for review (typically 1–3 business days)

For enterprise deployment without the Web Store, use **Chrome Enterprise** group policy to force-install the extension via CRX file.
