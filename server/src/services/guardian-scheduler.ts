import type { Db } from "@paperclipai/db";
import { guardianIncidents } from "@paperclipai/db";
import { and, eq, gt } from "drizzle-orm";
import { logger } from "../middleware/logger.js";
import {
  type GuardianConfig,
  defaultGuardianConfig,
} from "./guardian-config.js";
import {
  WatchdogOne,
  type WatchdogOneReport,
} from "./watchdog-one.js";
import {
  WatchdogTwo,
  type WatchdogTwoReport,
} from "./watchdog-two.js";
import { pushNotificationService } from "./push-notifications.js";

export interface GuardianSchedulerStatus {
  enabled: boolean;
  config: GuardianConfig;
  watchdogOne: {
    enabled: boolean;
    lastRunAt: string | null;
    lastReport: WatchdogOneReport | null;
  };
  watchdogTwo: {
    enabled: boolean;
    lastRunAt: string | null;
    lastReport: WatchdogTwoReport | null;
  };
}

export class GuardianScheduler {
  private readonly config: GuardianConfig;
  private readonly db: Db;
  private readonly watchdogOne: WatchdogOne;
  private readonly watchdogTwo: WatchdogTwo;
  private watchdogOneInterval: NodeJS.Timeout | null = null;
  private watchdogTwoInterval: NodeJS.Timeout | null = null;
  private started = false;
  private lastIncidentScanAt: Date = new Date();
  private readonly pushSvc: ReturnType<typeof pushNotificationService>;

  constructor(db: Db, config: GuardianConfig = defaultGuardianConfig) {
    this.db = db;
    this.config = config;
    this.watchdogOne = new WatchdogOne(db, config.watchdogOne);
    this.watchdogTwo = new WatchdogTwo(db, config.watchdogTwo);
    this.pushSvc = pushNotificationService(db);
  }

  start(): void {
    if (this.started) return;
    if (!this.config.enabled) {
      logger.info({ guardian: "disabled" }, "GuardianScheduler: disabled by config, not starting");
      return;
    }
    this.started = true;
    logger.info(
      {
        watchdogOne: this.config.watchdogOne,
        watchdogTwo: this.config.watchdogTwo,
      },
      "GuardianScheduler: starting",
    );

    if (this.config.watchdogOne.enabled) {
      this.watchdogOneInterval = setInterval(() => {
        void this.runWatchdogOne();
      }, this.config.watchdogOne.checkIntervalMs);
      this.watchdogOneInterval.unref?.();
    }

    if (this.config.watchdogTwo.enabled) {
      this.watchdogTwoInterval = setInterval(() => {
        void this.runWatchdogTwo();
      }, this.config.watchdogTwo.checkIntervalMs);
      this.watchdogTwoInterval.unref?.();
    }
  }

  stop(): void {
    if (this.watchdogOneInterval) {
      clearInterval(this.watchdogOneInterval);
      this.watchdogOneInterval = null;
    }
    if (this.watchdogTwoInterval) {
      clearInterval(this.watchdogTwoInterval);
      this.watchdogTwoInterval = null;
    }
    this.started = false;
  }

  getStatus(): GuardianSchedulerStatus {
    return {
      enabled: this.config.enabled,
      config: this.config,
      watchdogOne: {
        enabled: this.config.watchdogOne.enabled,
        lastRunAt: this.watchdogOne.getLastRunAt()?.toISOString() ?? null,
        lastReport: this.watchdogOne.getLastReport(),
      },
      watchdogTwo: {
        enabled: this.config.watchdogTwo.enabled,
        lastRunAt: this.watchdogTwo.getLastRunAt()?.toISOString() ?? null,
        lastReport: this.watchdogTwo.getLastReport(),
      },
    };
  }

  async runWatchdogOneNow(): Promise<WatchdogOneReport> {
    return await this.runWatchdogOne();
  }

  async runWatchdogTwoNow(): Promise<WatchdogTwoReport> {
    return await this.runWatchdogTwo();
  }

  private async runWatchdogOne(): Promise<WatchdogOneReport> {
    try {
      const report = await this.watchdogOne.tick();
      await this.notifyCriticalIncidents();
      return report;
    } catch (err) {
      logger.error({ err }, "GuardianScheduler: watchdogOne tick failed");
      return {
        scannedRuns: 0,
        stalledRuns: 0,
        retriesScheduled: 0,
        retriesExhausted: 0,
        blockersDetected: 0,
        incidentsCreated: 0,
        ranAt: new Date().toISOString(),
      };
    }
  }

  private async runWatchdogTwo(): Promise<WatchdogTwoReport> {
    try {
      const report = await this.watchdogTwo.tick();
      await this.notifyCriticalIncidents();
      return report;
    } catch (err) {
      logger.error({ err }, "GuardianScheduler: watchdogTwo tick failed");
      return {
        scannedRuns: 0,
        reviewedRuns: 0,
        incidentsCreated: 0,
        escalations: 0,
        ranAt: new Date().toISOString(),
      };
    }
  }

  private async notifyCriticalIncidents(): Promise<void> {
    const cutoff = this.lastIncidentScanAt;
    const now = new Date();
    this.lastIncidentScanAt = now;
    try {
      const rows = await this.db
        .select({
          id: guardianIncidents.id,
          companyId: guardianIncidents.companyId,
          incidentType: guardianIncidents.incidentType,
          description: guardianIncidents.description,
        })
        .from(guardianIncidents)
        .where(
          and(eq(guardianIncidents.severity, "critical"), gt(guardianIncidents.createdAt, cutoff)),
        );

      for (const row of rows) {
        await this.pushSvc.sendPushNotification(
          row.companyId,
          `Guardian alert: ${row.incidentType}`,
          row.description,
          { incidentId: row.id, kind: "guardian_incident" },
        );
        // Best-effort: dispatch a Postal alert email when a POSTAL_ALERT_TO
        // address is configured. We resolve Postal lazily and swallow errors
        // so alert delivery never blocks watchdog scans.
        await this.dispatchPostalAlert(row).catch((err) =>
          logger.warn({ err }, "GuardianScheduler: postal alert dispatch failed"),
        );
      }
    } catch (err) {
      logger.error({ err }, "GuardianScheduler: failed to deliver critical incident push notifications");
    }
  }

  private async dispatchPostalAlert(row: {
    id: string;
    companyId: string;
    incidentType: string;
    description: string;
  }): Promise<void> {
    const to = process.env.POSTAL_ALERT_TO;
    if (!to) return;
    const { AveroPostalService } = await import("@paperclipai/plugin-postal");
    const service = new AveroPostalService({ logger });
    await service.sendTemplate(
      "alert",
      to,
      {
        title: `Guardian alert: ${row.incidentType}`,
        message: row.description,
        severity: "critical",
        companyName: row.companyId,
      },
      row.companyId,
    );
  }
}

export function createGuardianScheduler(db: Db, config: GuardianConfig) {
  return new GuardianScheduler(db, config);
}
