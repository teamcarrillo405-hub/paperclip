import { promises as fs } from "node:fs";
import { logger } from "../middleware/logger.js";

export interface WatchdogOneConfig {
  enabled: boolean;
  stallThresholdMinutes: number;
  maxContinuationAttempts: number;
  checkIntervalMs: number;
}

export interface WatchdogTwoConfig {
  enabled: boolean;
  checkIntervalMs: number;
  qualityCheckDelayMs: number;
}

export interface GuardianConfig {
  enabled: boolean;
  watchdogOne: WatchdogOneConfig;
  watchdogTwo: WatchdogTwoConfig;
}

export const defaultGuardianConfig: GuardianConfig = {
  enabled: true,
  watchdogOne: {
    enabled: false,
    stallThresholdMinutes: 15,
    maxContinuationAttempts: 1,
    checkIntervalMs: 60_000,
  },
  watchdogTwo: {
    enabled: true,
    checkIntervalMs: 300_000,
    qualityCheckDelayMs: 30_000,
  },
};

function mergeConfig(base: GuardianConfig, overrides: Partial<GuardianConfig>): GuardianConfig {
  return {
    enabled: overrides.enabled ?? base.enabled,
    watchdogOne: {
      ...base.watchdogOne,
      ...(overrides.watchdogOne ?? {}),
    },
    watchdogTwo: {
      ...base.watchdogTwo,
      ...(overrides.watchdogTwo ?? {}),
    },
  };
}

function applyEnvOverrides(cfg: GuardianConfig): GuardianConfig {
  const next = mergeConfig(defaultGuardianConfig, cfg);
  const envEnabled = process.env.GUARDIAN_ENABLED;
  if (typeof envEnabled === "string") {
    if (envEnabled.toLowerCase() === "false" || envEnabled === "0") {
      next.enabled = false;
    } else if (envEnabled.toLowerCase() === "true" || envEnabled === "1") {
      next.enabled = true;
    }
  }
  return next;
}

export async function loadGuardianConfig(): Promise<GuardianConfig> {
  const configPath = process.env.GUARDIAN_CONFIG_PATH;
  if (!configPath) {
    return applyEnvOverrides(defaultGuardianConfig);
  }
  try {
    const raw = await fs.readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<GuardianConfig>;
    const merged = mergeConfig(defaultGuardianConfig, parsed);
    return applyEnvOverrides(merged);
  } catch (err) {
    logger.warn(
      { err, configPath },
      "Failed to load guardian config; falling back to defaults",
    );
    return applyEnvOverrides(defaultGuardianConfig);
  }
}
