# Avero Enterprise — Google Workspace Add-on

A Google Apps Script Add-on that embeds an Avero AI sidebar directly inside
Gmail and Google Docs. Users can draft replies, create tasks, summarize threads,
expand document selections, review documents, and generate new sections — all
without leaving their Google Workspace.

---

## Architecture Overview

```
Gmail / Google Docs sidebar
        |
   Apps Script (Code.gs)
        |
   UrlFetchApp.fetch()
        |
   Avero Enterprise Server  (Node.js, port 3100 by default)
        |
   /api/writing/generate
   /api/issues
```

The Add-on is **completely self-contained** — it is a Google Apps Script project
and does not share any code with the Node.js server.

---

## Setup Instructions

### Step 1 — Create the Apps Script Project

1. Go to [script.google.com](https://script.google.com) and sign in with the
   Google account that will own the Add-on.
2. Click **New project**.
3. Rename the project to **Avero Enterprise Add-on** (click "Untitled project"
   at the top).

---

### Step 2 — Replace the Default Files

#### Replace `Code.gs`

1. In the editor, click the `Code.gs` file in the left panel.
2. Select all content (`Ctrl+A` / `Cmd+A`) and delete it.
3. Paste the full contents of `workspace-addon/Code.gs` from this repository.
4. Save (`Ctrl+S` / `Cmd+S`).

#### Replace `appsscript.json` (the manifest)

1. In the Apps Script editor, click the gear icon **Project Settings** (bottom
   of left nav).
2. Check **Show "appsscript.json" manifest file in editor**, then close settings.
3. Click `appsscript.json` in the left panel.
4. Replace all content with the contents of `workspace-addon/appsscript.json`.
5. Save.

---

### Step 3 — Set Script Properties

Script Properties store your server URL and company ID without hardcoding them.

1. In the Apps Script editor, click **Project Settings** (gear icon).
2. Scroll down to **Script Properties**.
3. Click **Add script property** and add these two entries:

| Property name      | Value                                        |
|--------------------|----------------------------------------------|
| `AVERO_BASE_URL`   | Your server's API base URL, e.g. `https://your-server.com/api` or `http://localhost:3100/api` |
| `AVERO_COMPANY_ID` | Your Avero company ID (UUID or slug)         |

4. Click **Save script properties**.

> **Local development note**: `http://localhost:3100` will only work when the
> Add-on is running in the same network as your dev machine. For production or
> sharing, deploy your server publicly and use its HTTPS URL.

---

### Step 4 — Deploy as a Test Deployment

1. Click **Deploy** > **Test deployments** in the top-right toolbar.
2. Select **Install** next to the "Google Workspace Add-on" type.
3. Choose the Google account to install it for.
4. Click **Done**.

The Add-on is now installed in your Gmail and Google Docs for testing.

---

### Step 5 — (Optional) Deploy for Production / Sharing

When ready to share with your team:

1. Click **Deploy** > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Google Workspace Add-on**.
3. Fill in the description (e.g. "Avero Enterprise v1.0").
4. Click **Deploy**.
5. Copy the **Deployment ID**.
6. Distribute via your Google Workspace Admin console:
   - Go to **Google Admin** > **Apps** > **Google Workspace Marketplace apps** >
     **Add app** > **Add custom app**.
   - Paste the Deployment ID.

---

### Step 6 — (Optional) Use clasp for Local Development

[clasp](https://github.com/google/clasp) lets you push code from your local
machine directly to Apps Script.

```bash
npm install -g @google/clasp
clasp login
```

Update `.clasp.json` with your real script ID (found in **Project Settings** >
**IDs** > **Script ID**):

```json
{
  "scriptId": "YOUR_ACTUAL_SCRIPT_ID",
  "rootDir": "./workspace-addon"
}
```

Then push changes:

```bash
clasp push
```

---

## File Reference

| File                | Purpose                                                   |
|---------------------|-----------------------------------------------------------|
| `Code.gs`           | All Apps Script logic — triggers, action handlers, helpers |
| `appsscript.json`   | Add-on manifest — declares triggers and metadata          |
| `.clasp.json`       | clasp config for local development pushes                 |
| `README.md`         | This file                                                 |

---

## Gmail Features

| Feature            | How to trigger                           | API endpoint called              |
|--------------------|------------------------------------------|----------------------------------|
| Draft a Reply      | Open email > enter instructions > click "Generate Reply" | `POST /api/writing/generate` |
| Create Task        | Open email > set title and priority > click "Create Task" | `POST /api/issues`          |
| Summarize Thread   | Open email > click "Summarize Thread"    | `POST /api/writing/generate`     |

## Google Docs Features

| Feature              | How to trigger                                        | API endpoint called              |
|----------------------|-------------------------------------------------------|----------------------------------|
| Expand Selection     | Select text in doc > click "Expand Selected Text"     | `POST /api/writing/generate`     |
| Full Document Review | Click "Full Document Review"                          | `POST /api/writing/generate`     |
| Generate Section     | Enter section name > choose doc type > click "Generate" | `POST /api/writing/generate`   |

---

## API Contract

The Add-on calls `POST /api/writing/generate` with this body shape:

```json
{
  "companyId":  "string",
  "docType":    "email | report | proposal | memo | meeting-summary | general",
  "topic":      "string (optional)",
  "userPrompt": "string"
}
```

Expected response (any of these fields):

```json
{ "content": "..." }
{ "text": "..." }
{ "result": "..." }
{ "output": "..." }
{ "data": { "content": "..." } }
```

For task creation it calls `POST /api/issues`:

```json
{
  "companyId":   "string",
  "title":       "string",
  "description": "string",
  "priority":    "low | medium | high | urgent",
  "source":      "gmail",
  "metadata": {
    "gmailMessageId": "string",
    "gmailSubject":   "string",
    "gmailFrom":      "string"
  }
}
```

---

## Troubleshooting

**"Exception: You do not have permission to call GmailApp"**
- The Add-on needs the Gmail scope. Re-install the test deployment and accept
  all permission prompts.

**"UrlFetchApp: Request failed"**
- Verify `AVERO_BASE_URL` is correct and reachable from Google's servers.
- For local development, use a tunnel (e.g. [ngrok](https://ngrok.com)):
  `ngrok http 3100` then set `AVERO_BASE_URL` to the ngrok HTTPS URL.

**Cards not showing up in Gmail**
- Hard-refresh Gmail (`Ctrl+Shift+R`).
- Confirm the Add-on is installed via **Settings** > **See all settings** >
  **Add-ons**.

**"Script property AVERO_COMPANY_ID is missing"**
- Follow Step 3 above to add the property in Project Settings.
