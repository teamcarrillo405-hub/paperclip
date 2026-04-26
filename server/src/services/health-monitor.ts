import { promises as fs } from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { resolvePaperclipInstanceRoot, resolveDefaultBackupDir } from "../home-paths.js";

export type CheckResult = { ok: boolean; message: string; latencyMs?: number; warn?: boolean };

export type HealthStatus = {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  timestamp: string;
  checks: {
    database: CheckResult;
    storage: CheckResult;
    memory: CheckResult;
    lastBackup: CheckResult;
  };
};

async function checkDatabase(db: Db): Promise<CheckResult> {
  const start = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    const latencyMs = Date.now() - start;
    if (latencyMs > 2000) {
      return { ok: false, message: `Database responded but latency too high (${latencyMs}ms)`, latencyMs };
    }
    return { ok: true, message: "Database reachable", latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Database unreachable: ${message}`, latencyMs };
  }
}

async function checkStorage(): Promise<CheckResult> {
  const instanceRoot = resolvePaperclipInstanceRoot();
  const probeFile = path.resolve(instanceRoot, ".health-probe-tmp");
  try {
    await fs.stat(instanceRoot);
    await fs.writeFile(probeFile, "ok", "utf-8");
    await fs.unlink(probeFile);
    return { ok: true, message: "Storage directory exists and is writable" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Storage check failed: ${message}` };
  }
}

function checkMemory(): CheckResult {
  const { heapUsed, heapTotal } = process.memoryUsage();
  const ratio = heapTotal > 0 ? heapUsed / heapTotal : 0;
  const pct = Math.round(ratio * 100);
  const used = Math.round(heapUsed / 1024 / 1024);
  const total = Math.round(heapTotal / 1024 / 1024);
  const message = `Heap usage: ${pct}% (${used}MB / ${total}MB)`;
  if (ratio > 0.8) {
    // warn, not a hard failure — mark ok:true + warn:true so status rolls up to "degraded"
    return { ok: true, warn: true, message: `High ${message}` };
  }
  return { ok: true, message };
}

async function checkLastBackup(): Promise<CheckResult> {
  const backupDir = resolveDefaultBackupDir();
  try {
    const entries = await fs.readdir(backupDir);
    const files = entries.filter((e) => !e.startsWith("."));

    if (files.length === 0) {
      return { ok: false, message: "No backup files found in backup directory" };
    }

    let newestMtime = 0;
    for (const file of files) {
      try {
        const stat = await fs.stat(path.resolve(backupDir, file));
        if (stat.mtimeMs > newestMtime) newestMtime = stat.mtimeMs;
      } catch {
        // skip unreadable entries
      }
    }

    if (newestMtime === 0) {
      return { ok: false, message: "Could not stat any backup files" };
    }

    const ageMs = Date.now() - newestMtime;
    const ageHours = ageMs / (1000 * 60 * 60);

    if (ageHours > 72) {
      return { ok: false, message: `Last backup is ${ageHours.toFixed(1)} hours old (limit: 72h)` };
    }
    if (ageHours > 25) {
      // warn — degraded, not unhealthy
      return { ok: true, warn: true, message: `Last backup is ${ageHours.toFixed(1)} hours old (warn threshold: 25h)` };
    }
    return { ok: true, message: `Last backup is ${ageHours.toFixed(1)} hours old` };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { ok: false, message: "Backup directory does not exist" };
    }
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, message: `Backup check failed: ${message}` };
  }
}

function deriveStatus(
  checks: Record<string, CheckResult>,
): "healthy" | "degraded" | "unhealthy" {
  const values = Object.values(checks);
  if (values.some((c) => !c.ok)) return "unhealthy";
  if (values.some((c) => c.warn)) return "degraded";
  return "healthy";
}

export async function runHealthCheck(db: Db): Promise<HealthStatus> {
  const [database, storage, lastBackup] = await Promise.all([
    checkDatabase(db),
    checkStorage(),
    checkLastBackup(),
  ]);
  const memory = checkMemory();

  const checks = { database, storage, memory, lastBackup };

  return {
    status: deriveStatus(checks),
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    checks,
  };
}
