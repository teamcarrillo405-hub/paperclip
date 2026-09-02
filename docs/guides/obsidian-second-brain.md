# Obsidian as an agent-writable second brain

This wires an Obsidian vault into Paperclip so hired agents (e.g. a Claude Code
agent) can read and write notes as shared context, with your full vault
readable and writable by the agent (no folder restriction), and a git safety
net so any write is revertible.

Everything below runs **on the same machine as Paperclip and Obsidian** (your
home computer) — there's nothing to deploy remotely.

## How this is wired

Obsidian's "Local REST API" plugin now ships its own MCP (Model Context
Protocol) endpoint directly — so agents talk to your vault as an MCP server,
the same mechanism Claude Code uses for any other tool integration. There's no
separate Paperclip plugin package involved: the hired agent's `claude` CLI
invocation is simply told about the MCP server via its `extraArgs` config,
which Paperclip's Claude adapter already supports as a plain field in the
agent's settings.

```
Agent (claude-local adapter)
   │  --mcp-config /path/to/obsidian-mcp.json   (extraArgs)
   ▼
Obsidian Local REST API plugin  (http://127.0.0.1:27123/mcp/)
   │
   ▼
Your vault (markdown files on disk)
   │
   ▼
obsidian-vault-autocommit.mjs  (polls + git commits any change)
```

## 1. Enable the Local REST API plugin in Obsidian

1. In Obsidian: **Settings → Community plugins → Browse**, search for
   **"Local REST API"** (by coddingtonbear), install and enable it.
2. Go to **Settings → Local REST API**.
3. Copy the **API key** shown there — you'll need it below.
4. Enable the **non-encrypted HTTP** option (port `27123`). Since this never
   leaves your machine (loopback only) and every request still requires the
   bearer API key, plain HTTP avoids dealing with the plugin's self-signed
   HTTPS certificate. If you'd rather keep HTTPS only, you can — you'll just
   need to import the plugin's CA cert (downloadable from the same settings
   page) so `claude`'s MCP client trusts it.

## 2. Create the MCP config file

Create a file the agent's `claude` invocation will load, e.g.
`~/.paperclip/obsidian-mcp.json`:

```json
{
  "mcpServers": {
    "obsidian": {
      "type": "http",
      "url": "http://127.0.0.1:27123/mcp/",
      "headers": {
        "Authorization": "Bearer <your-api-key-from-step-1>"
      }
    }
  }
}
```

This file has your vault's API key in plaintext, so lock it down:

```bash
chmod 600 ~/.paperclip/obsidian-mcp.json
```

## 3. Point the agent at it

In Paperclip, open the agent you want to have vault access (e.g. your CEO
agent) → its Claude adapter config → **Extra args**, and add:

```
--mcp-config,/home/you/.paperclip/obsidian-mcp.json
```

(comma-separated, matching the field's format — use the real absolute path).

This scopes vault access to *this specific agent* rather than every agent you
ever hire — add the same flag to other agents individually if you want them
to have it too.

One thing to know: this adapter defaults `dangerouslySkipPermissions` to
**on**, which is what lets a heartbeat-driven agent actually call the new
Obsidian tools without hanging on an interactive approval prompt it can never
answer. That also means this agent isn't asking you before it acts on other
tools either — worth knowing since you're granting it real write access to
your notes on top of that.

## 4. Turn the vault into a safety net

From the repo root, with your vault path:

```bash
node scripts/obsidian-vault-autocommit.mjs /path/to/your/vault
```

This initializes git in the vault if it isn't already a repo, then polls
every 30 seconds and commits any change (from the agent, from Obsidian, from
you) with a timestamped message. Any bad write is a normal `git revert` /
`git log` away.

It also adds `.obsidian/plugins/*/data.json` to the vault's `.gitignore`
before the first commit (and backfills it into an existing vault repo if you
already had one) — that's where the Local REST API plugin, and most other
plugins that store credentials, keep them in plaintext. Without this, your
API key would otherwise end up committed into the vault's git history.

Keep it running in the background — e.g. as a `launchd` (macOS) or `systemd`
(Linux) user service, or a simple `pm2 start` / `screen` session. It needs to
be running continuously alongside Paperclip and Obsidian for the safety net to
apply.

## 5. Verify it

1. Start the autocommit script (step 4) and confirm it logs
   `Watching <path> for changes...`.
2. Trigger a heartbeat/task run on the agent and ask it (in the task
   description or a comment) to write a test note into the vault.
3. Confirm the note appears in Obsidian, and that
   `git -C /path/to/your/vault log --oneline -1` shows a new autosave commit.
4. Delete the test note if you don't want it kept.
