# Obsidian as an agent-writable second brain

This wires an Obsidian vault into Paperclip so a hired agent running on the
**Claude Code (local)** adapter can read and write notes as shared context,
with full read/write access to the whole vault (no folder restriction), and a
git safety net so any write is revertible.

Everything below runs **on the same machine as Paperclip and Obsidian** (your
home computer) — there's nothing to deploy remotely. It only works with the
adapter's default *local* execution target; see step 3.

## How this is wired

Obsidian's "Local REST API" plugin ships its own MCP (Model Context Protocol)
endpoint — so the agent talks to your vault as an MCP server, the same
mechanism Claude Code uses for any other tool integration. There's no
separate Paperclip plugin package involved: the agent's `claude` CLI
invocation is told about the MCP server via the adapter's **Extra args**
field, which already exists in the agent's settings.

```
Agent (Claude Code (local) adapter, type claude_local)
   │  --mcp-config /path/to/obsidian-mcp.json   (Extra args)
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

**Keeping the key out of the file (optional).** Claude Code expands `${VAR}`
references in MCP config, and the adapter's `env` field supports Paperclip
secret refs. So you can instead store the key as a Paperclip secret, expose
it to the agent as `OBSIDIAN_API_KEY` via its `env` config, and write the
header as `"Bearer ${OBSIDIAN_API_KEY}"`. That keeps the key inside
Paperclip's secret handling (rotation, visibility) rather than a loose file.
If your `claude` version doesn't expand it, fall back to the inline key above.

## 3. Point the agent at it

In Paperclip, open the agent you want to have vault access (e.g. your CEO
agent) → its **Claude Code (local)** adapter config → **Extra args**, and add:

```
--mcp-config,/home/you/.paperclip/obsidian-mcp.json
```

The field is comma-separated (that's how it becomes two CLI arguments), so
use the real absolute path and avoid a path containing a comma — it would be
split in two.

This scopes vault access to *this specific agent* rather than every agent you
ever hire — add the same flag to other agents individually if you want them
to have it too.

Two things to know:

- **Local execution target only.** If the agent's execution target is a
  remote/sandbox environment, the adapter replaces the permission bypass with
  a fixed tool allowlist that doesn't include MCP tools, and the config path
  above wouldn't exist on the remote anyway — the Obsidian tools would be
  silently unavailable. Keep this agent on the default local target.
- **Permissions.** The adapter's `dangerouslySkipPermissions` setting
  (see the [Claude Code (local) adapter reference](../adapters/claude-local.md))
  defaults to on, which is what lets a heartbeat-driven agent call the
  Obsidian tools without hanging on an interactive prompt it can never
  answer. It also means this agent isn't asking you before it acts on other
  tools either — worth remembering given you're granting it real write access
  to your notes on top of that.

## 4. Turn the vault into a safety net

This step needs the Paperclip **git checkout** — the script lives in the
repo's `scripts/` directory, which isn't part of the `npx paperclipai`
package. From the repo root, with your vault path:

```bash
node scripts/obsidian-vault-autocommit.mjs /path/to/your/vault
```

Optionally pass `--interval-seconds <n>` (default 30). Larger values are
fine — the goal is revertibility, not real-time.

What it does:

- Initializes git in the vault if it isn't already a repo.
- Adds ignore rules for `.obsidian*/plugins/*/data.json` at any depth — that's
  where the Local REST API plugin (and most other plugins that store
  credentials) keep them in plaintext — and for Obsidian's `workspace*.json`
  files, which change on every pane/tab click and would otherwise produce a
  content-free commit every poll. Plugin and theme settings under
  `.obsidian/` are still versioned.
- If the vault was **already** a git repo with those data files tracked, it
  untracks them and prints a warning: their contents, including the API key,
  are still in the repo's history. Rotate the key in Obsidian if that happens,
  and scrub the history if the repo was ever pushed or shared.
- Checks that git is installed and a git identity is configured, and exits
  with a clear message if not.
- Then polls, and commits any change (from the agent, from Obsidian, from
  you) with a timestamped message. Any bad write is a normal `git revert` /
  `git log` away.

One limitation: the ignore rules cover config folders named `.obsidian` or
`.obsidian-<anything>`. If you've overridden Obsidian's config folder to a
completely different name, add the equivalent rule to the vault's
`.gitignore` yourself before the first run.

It only protects you while it's running, so keep it up alongside Paperclip
and Obsidian — e.g. as a `launchd` (macOS) or `systemd` (Linux) user service,
or a `pm2` / `screen` session. It stops cleanly on the SIGTERM those send,
and exits non-zero after repeated failures so the service manager can
surface a problem instead of it silently stopping.

## 5. Verify it

1. Start the autocommit script (step 4) and confirm it logs
   `Watching <path> for changes...`.
2. Trigger a heartbeat/task run on the agent and ask it (in the task
   description or a comment) to write a test note into the vault.
3. Confirm the note appears in Obsidian, and that
   `git -C /path/to/your/vault log --oneline -1` shows a new autosave commit.
4. Delete the test note if you don't want it kept.
