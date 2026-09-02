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
import { existsSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function parseArgs(argv) {
  const args = argv.slice(2);
  const vaultPath = args.find((a) => !a.startsWith("--"));
  if (!vaultPath) {
    console.error("Usage: node obsidian-vault-autocommit.mjs <vault-path> [--interval-seconds 30]");
    process.exit(1);
  }
  const intervalFlagIndex = args.indexOf("--interval-seconds");
  const intervalSeconds =
    intervalFlagIndex !== -1 && args[intervalFlagIndex + 1]
      ? Number(args[intervalFlagIndex + 1])
      : 30;
  if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
    console.error("--interval-seconds must be a positive number");
    process.exit(1);
  }
  return { vaultPath, intervalSeconds };
}

async function git(vaultPath, gitArgs) {
  return execFileAsync("git", gitArgs, { cwd: vaultPath });
}

async function ensureRepo(vaultPath) {
  if (!existsSync(vaultPath)) {
    console.error(`Vault path does not exist: ${vaultPath}`);
    process.exit(1);
  }
  if (!existsSync(`${vaultPath}/.git`)) {
    console.log(`No git repo found at ${vaultPath} — initializing one.`);
    await git(vaultPath, ["init"]);
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
  process.on("SIGINT", () => {
    stopping = true;
    console.log("\nStopping.");
    process.exit(0);
  });

  while (!stopping) {
    try {
      const committed = await commitIfChanged(vaultPath);
      if (committed) console.log(`[${new Date().toISOString()}] committed vault changes`);
    } catch (err) {
      console.error(`[${new Date().toISOString()}] autocommit error:`, err instanceof Error ? err.message : err);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main();
