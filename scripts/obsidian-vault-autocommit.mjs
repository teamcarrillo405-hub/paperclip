#!/usr/bin/env node
// Safety net for an Obsidian vault that agents have write access to.
//
// Polls the vault directory for changes and commits them to git so any
// agent write (or human edit) is always revertible. Works regardless of
// who touched the vault — Obsidian, an agent via the Local REST API/MCP,
// or you editing a file directly.
//
// Usage:
//   node scripts/obsidian-vault-autocommit.mjs /path/to/vault [--interval-seconds 30]

import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

// Obsidian community plugins (the Local REST API plugin included) commonly
// store API keys and other secrets in their data.json under .obsidian/. A
// blind `git add -A` would otherwise commit those secrets into vault
// history permanently, even if the file is deleted later.
const GITIGNORE_ENTRIES = [".obsidian/plugins/*/data.json"];

function parseArgs(argv) {
  const args = argv.slice(2);
  const positional = [];
  let intervalSeconds = 30;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--interval-seconds") {
      const value = args[i + 1];
      intervalSeconds = Number(value);
      i++;
      continue;
    }
    if (arg.startsWith("--")) {
      console.error(`Unknown flag: ${arg}`);
      process.exit(1);
    }
    positional.push(arg);
  }

  const vaultPath = positional[0];
  if (!vaultPath) {
    console.error("Usage: node obsidian-vault-autocommit.mjs <vault-path> [--interval-seconds 30]");
    process.exit(1);
  }
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    console.error("--interval-seconds must be a positive number");
    process.exit(1);
  }
  return { vaultPath, intervalSeconds };
}

async function git(vaultPath, gitArgs) {
  return execFileAsync("git", gitArgs, { cwd: vaultPath });
}

function ensureGitignore(vaultPath) {
  const gitignorePath = `${vaultPath}/.gitignore`;
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const existingLines = new Set(existing.split("\n").map((line) => line.trim()));
  const missing = GITIGNORE_ENTRIES.filter((entry) => !existingLines.has(entry));
  if (missing.length === 0) return;

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${existing}${separator}${missing.join("\n")}\n`);
}

async function ensureRepo(vaultPath) {
  if (!existsSync(vaultPath)) {
    console.error(`Vault path does not exist: ${vaultPath}`);
    process.exit(1);
  }

  const isNewRepo = !existsSync(`${vaultPath}/.git`);
  if (isNewRepo) {
    console.log(`No git repo found at ${vaultPath} — initializing one.`);
    await git(vaultPath, ["init"]);
  }

  // Always ensure the ignore rules are present, not just on first init —
  // an existing vault repo predating this script won't have them yet.
  ensureGitignore(vaultPath);

  if (isNewRepo) {
    await git(vaultPath, ["add", "-A"]);
    await git(vaultPath, ["commit", "-m", "Initial vault snapshot", "--allow-empty"]).catch(() => {
      // No user.name/user.email configured yet — surface a clear error instead of looping forever.
      console.error(
        "git commit failed. Set a git identity first, e.g.:\n" +
          '  git -C "' +
          vaultPath +
          '" config user.email "you@example.com"\n' +
          '  git -C "' +
          vaultPath +
          '" config user.name "Your Name"',
      );
      process.exit(1);
    });
  }
}

async function commitIfChanged(vaultPath) {
  const { stdout } = await git(vaultPath, ["status", "--porcelain"]);
  if (!stdout.trim()) return false;

  const timestamp = new Date().toISOString();
  await git(vaultPath, ["add", "-A"]);
  await git(vaultPath, ["commit", "-m", `vault autosave: ${timestamp}`]);
  return true;
}

async function main() {
  const { vaultPath, intervalSeconds } = parseArgs(process.argv);
  await ensureRepo(vaultPath);

  console.log(
    `Watching ${vaultPath} for changes — committing every ${intervalSeconds}s when something changed. Ctrl+C to stop.`,
  );

  let stopping = false;
  let wakeSleep = null;
  process.on("SIGINT", () => {
    if (stopping) {
      // Second Ctrl+C: the user wants out now, even mid-operation.
      process.exit(1);
    }
    stopping = true;
    console.log("\nStopping after the current check (press Ctrl+C again to force-quit)...");
    if (wakeSleep) wakeSleep();
  });

  // A cancellable sleep so SIGINT can end the wait promptly, but only
  // between iterations — never while a git command is in flight — so we
  // never race an in-flight `git add`/`git commit` and leave a stale
  // .git/index.lock behind.
  function sleep(ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      wakeSleep = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  }

  while (!stopping) {
    try {
      const committed = await commitIfChanged(vaultPath);
      if (committed) console.log(`[${new Date().toISOString()}] committed vault changes`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] autocommit error:`, err instanceof Error ? err.message : err);
    }
    if (stopping) break;
    await sleep(intervalSeconds * 1000);
  }
}

main();
