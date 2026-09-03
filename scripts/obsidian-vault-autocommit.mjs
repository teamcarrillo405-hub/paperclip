#!/usr/bin/env node
// Safety net for an Obsidian vault that agents have write access to.
//
// Polls the vault directory for changes and commits them to git so any
// agent write (or human edit) is always revertible. Works regardless of
// who touched the vault — Obsidian, an agent via the Local REST API/MCP,
// or you editing a file directly.
//
// Usage:
//   node scripts/obsidian-vault-autocommit.mjs <vault-path> [--interval-seconds 30]

import { execFile } from "node:child_process";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs, promisify } from "node:util";

const execFileAsync = promisify(execFile);

const USAGE = "Usage: node scripts/obsidian-vault-autocommit.mjs <vault-path> [--interval-seconds 30]";

// gitignore patterns. `**/` matches at any depth (including the vault root,
// and vaults nested under the watched directory) and `.obsidian*` also
// covers a renamed config folder such as `.obsidian-work`.
//
// - plugin data.json: Obsidian community plugins (the Local REST API plugin
//   included) store API keys and other secrets there in plaintext. A blind
//   `git add -A` would commit them into history permanently.
// - workspace files: Obsidian rewrites these on nearly every pane/tab/scroll
//   change, which would otherwise produce a content-free commit every poll.
const SECRET_IGNORE_PATTERNS = ["**/.obsidian*/plugins/*/data.json"];
const NOISE_IGNORE_PATTERNS = [
  "**/.obsidian*/workspace.json",
  "**/.obsidian*/workspace-mobile.json",
  "**/.obsidian*/workspace.json.bak",
];
const GITIGNORE_ENTRIES = [...SECRET_IGNORE_PATTERNS, ...NOISE_IGNORE_PATTERNS];

// `git ls-files` pathspecs for the same secret files. Default pathspec
// wildcards can span `/`, so these two cover the root and any nesting depth.
const SECRET_PATHSPECS = [".obsidian*/plugins/*/data.json", "*/.obsidian*/plugins/*/data.json"];

// After this many polls in a row fail, exit non-zero so a service manager
// (systemd/launchd/pm2) surfaces the problem instead of the net silently
// rotting while it keeps logging.
const MAX_CONSECUTIVE_FAILURES = 5;

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseCliArgs(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv.slice(2),
      options: {
        "interval-seconds": { type: "string", default: "30" },
        help: { type: "boolean", short: "h", default: false },
      },
      allowPositionals: true,
    });
  } catch (err) {
    fail(`${err.message}\n${USAGE}`);
  }
  if (parsed.values.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (parsed.positionals.length !== 1) fail(USAGE);

  const intervalSeconds = Number(parsed.values["interval-seconds"]);
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    fail("--interval-seconds must be a positive number");
  }
  return { vaultPath: parsed.positionals[0], intervalSeconds };
}

async function git(vaultPath, gitArgs) {
  return execFileAsync("git", gitArgs, { cwd: vaultPath, maxBuffer: 16 * 1024 * 1024 });
}

async function assertPrerequisites(vaultPath) {
  if (!existsSync(vaultPath) || !statSync(vaultPath).isDirectory()) {
    fail(`Vault path is not a directory: ${vaultPath}`);
  }
  await execFileAsync("git", ["--version"]).catch(() =>
    fail("git was not found on PATH. Install git, or add it to PATH for the service that runs this script."),
  );
}

// Checked for every repo, not just freshly initialized ones — an existing
// vault repo on a machine with no git identity would otherwise fail every
// poll with a raw "Author identity unknown" error.
async function assertGitIdentity(vaultPath) {
  await git(vaultPath, ["var", "GIT_COMMITTER_IDENT"]).catch(() =>
    fail(
      `No git identity is configured. Set one first, e.g.:\n` +
        `  git -C "${vaultPath}" config user.email "you@example.com"\n` +
        `  git -C "${vaultPath}" config user.name "Your Name"`,
    ),
  );
}

function ensureGitignore(vaultPath) {
  const gitignorePath = join(vaultPath, ".gitignore");
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const existingLines = new Set(existing.split("\n").map((line) => line.trim()));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !existingLines.has(entry));
  if (missing.length === 0) return;

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${existing}${separator}${missing.join("\n")}\n`);
}

// A .gitignore entry does nothing for files git already tracks, so a vault
// that was a repo before this script ran (or before the ignore rules existed)
// would keep committing its plugin secrets on every change. Untrack them.
async function untrackSecrets(vaultPath) {
  const { stdout } = await git(vaultPath, ["ls-files", "-z", "--", ...SECRET_PATHSPECS]);
  const tracked = stdout.split("\0").filter(Boolean);
  if (tracked.length === 0) return;

  await git(vaultPath, ["rm", "--cached", "-q", "--", ...tracked]);
  console.warn(
    `WARNING: ${tracked.length} plugin data file(s) were already tracked by git and have now been untracked:\n` +
      tracked.map((file) => `  ${file}`).join("\n") +
      `\nTheir contents — including any API key — are still in this repo's git history.\n` +
      `Rotate the Local REST API key in Obsidian, and if this repo has ever been pushed or shared, scrub its history as well.`,
  );
}

async function ensureRepo(vaultPath) {
  if (!existsSync(join(vaultPath, ".git"))) {
    console.log(`No git repo found at ${vaultPath} — initializing one.`);
    await git(vaultPath, ["init", "-q"]);
  }
  // Always applied, not just on first init — an existing vault repo
  // predating this script won't have the rules yet.
  ensureGitignore(vaultPath);
  await untrackSecrets(vaultPath);
  await assertGitIdentity(vaultPath);
}

// Stage first, then ask the index whether anything is staged. This decides
// against the same snapshot that gets committed (no status-then-add race),
// walks the tree once, and captures no output that could overflow a buffer.
async function commitIfChanged(vaultPath) {
  await git(vaultPath, ["add", "-A"]);
  const hasStagedChanges = await git(vaultPath, ["diff", "--cached", "--quiet"]).then(
    () => false,
    (err) => {
      if (err.code === 1) return true;
      throw err;
    },
  );
  if (!hasStagedChanges) return false;

  await git(vaultPath, ["commit", "-q", "-m", `vault autosave: ${new Date().toISOString()}`]);
  return true;
}

async function main() {
  const { vaultPath, intervalSeconds } = parseCliArgs(process.argv);
  await assertPrerequisites(vaultPath);
  await ensureRepo(vaultPath);

  // One abort signal ends the wait between polls promptly and stops the loop
  // from starting another git operation. It is wired to SIGTERM as well as
  // SIGINT because that's what systemd, launchd and pm2 send on stop.
  //
  // This does not shield an in-flight git command from the signal itself: a
  // terminal Ctrl+C reaches the git child too, and a supervisor kills the
  // whole process group. That's fine — git cleans up its own index.lock, and
  // an interrupted commit is simply picked up on the next start.
  const stop = new AbortController();
  for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
    process.on(signal, () => {
      if (stop.signal.aborted) process.exit(1);
      console.log(`\nReceived ${signal} — stopping after the current check (send it again to force-quit)...`);
      stop.abort();
    });
  }

  console.log(
    `Watching ${vaultPath} for changes — committing every ${intervalSeconds}s when something changed. Ctrl+C to stop.`,
  );

  let consecutiveFailures = 0;
  while (!stop.signal.aborted) {
    try {
      if (await commitIfChanged(vaultPath)) {
        console.log(`[${new Date().toISOString()}] committed vault changes`);
      }
      consecutiveFailures = 0;
    } catch (err) {
      consecutiveFailures += 1;
      console.error(`[${new Date().toISOString()}] autocommit error: ${err instanceof Error ? err.message : err}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        fail(`${MAX_CONSECUTIVE_FAILURES} consecutive failures — exiting so your service manager can surface this.`);
      }
    }
    await delay(intervalSeconds * 1000, undefined, { signal: stop.signal }).catch(() => {});
  }
  console.log("Stopped.");
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
