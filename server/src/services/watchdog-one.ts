import { and, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agents,
  guardianIncidents,
  heartbeatRuns,
  issues,
} from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import { publishLiveEvent } from "./live-events.js";
import { classifyRunLiveness } from "./run-liveness.js";
import type { GuardianConfig, WatchdogOneConfig } from "./guardian-config.js";

export interface WatchdogOneReport {
  scannedRuns: number;
  stalledRuns: number;
  retriesScheduled: number;
  retriesExhausted: number;
  blockersDetected: number;
  incidentsCreated: number;
  ranAt: string;
}

const BLOCKER_INCIDENT_WINDOW_MS = 30 * 60 * 1000;

export class WatchdogOne {
  private readonly db: Db;
  private readonly config: WatchdogOneConfig;
  private lastReport: WatchdogOneReport | null = null;
  private lastRunAt: Date | null = null;

  constructor(db: Db, config: WatchdogOneConfig) {
    this.db = db;
    this.config = config;
  }

  getLastReport(): WatchdogOneReport | null {
    return this.lastReport;
  }

  getLastRunAt(): Date | null {
    return this.lastRunAt;
  }

  async tick(): Promise<WatchdogOneReport> {
    const report = await this.detectAndHandleStalls();
    this.lastReport = report;
    this.lastRunAt = new Date();
    return report;
  }

  async detectAndHandleStalls(companyId?: string): Promise<WatchdogOneReport> {
    const report: WatchdogOneReport = {
      scannedRuns: 0,
      stalledRuns: 0,
      retriesScheduled: 0,
      retriesExhausted: 0,
      blockersDetected: 0,
      incidentsCreated: 0,
      ranAt: new Date().toISOString(),
    };

    const thresholdMs = this.config.stallThresholdMinutes * 60_000;
    const cutoff = new Date(Date.now() - thresholdMs);

    const staleFilter = or(
      isNull(heartbeatRuns.lastUsefulActionAt),
      lt(heartbeatRuns.lastUsefulActionAt, cutoff),
    );

    const conditions = [
      eq(heartbeatRuns.status, "running"),
      lt(heartbeatRuns.startedAt, cutoff),
      staleFilter,
    ];
    if (companyId) {
      conditions.push(eq(heartbeatRuns.companyId, companyId));
    }

    const runs = await this.db
      .select()
      .from(heartbeatRuns)
      .where(and(...conditions));

    report.scannedRuns = runs.length;

    for (const run of runs) {
      const classification = classifyRunLiveness({
        runStatus: run.status,
        issue: null,
        resultJson: run.resultJson ?? null,
        stdoutExcerpt: run.stdoutExcerpt,
        stderrExcerpt: run.stderrExcerpt,
        error: run.error,
        errorCode: run.errorCode,
        continuationAttempt: run.continuationAttempt,
      });

      const stateLooksStuck =
        classification.livenessState === "blocked" ||
        classification.livenessState === "plan_only" ||
        classification.livenessState === "empty_response" ||
        classification.livenessState === "needs_followup";

      const timeStuck =
        !run.lastUsefulActionAt ||
        new Date(run.lastUsefulActionAt).getTime() < cutoff.getTime();

      if (!stateLooksStuck && !timeStuck) continue;

      report.stalledRuns += 1;

      const attempt = run.continuationAttempt ?? 0;
      if (attempt < this.config.maxContinuationAttempts) {
        await this.recordIncident({
          companyId: run.companyId,
          watchdog: "watchdog_one",
          agentId: run.agentId,
          runId: run.id,
          incidentType: "stall_detected",
          severity: "warning",
          description: `Agent run ${run.id.slice(0, 8)} stalled (${classification.livenessState}): ${classification.livenessReason}`.slice(0, 1000),
          recommendedAction: "Automatic retry scheduled",
          autoActionTaken: "retried",
        });
        try {
          await this.db
            .update(heartbeatRuns)
            .set({
              scheduledRetryAt: new Date(),
              scheduledRetryAttempt: (run.scheduledRetryAttempt ?? 0) + 1,
              scheduledRetryReason: "guardian_watchdog_one_stall",
              updatedAt: new Date(),
            })
            .where(eq(heartbeatRuns.id, run.id));
          report.retriesScheduled += 1;
        } catch (err) {
          logger.error({ err, runId: run.id }, "WatchdogOne: failed to schedule retry");
        }
        logger.warn(
          { runId: run.id, agentId: run.agentId, attempt, livenessState: classification.livenessState },
          "WatchdogOne: stall detected, retry scheduled",
        );
      } else {
        await this.recordIncident({
          companyId: run.companyId,
          watchdog: "watchdog_one",
          agentId: run.agentId,
          runId: run.id,
          incidentType: "retry_exhausted",
          severity: "critical",
          description: `Agent run ${run.id.slice(0, 8)} exhausted ${attempt} retries and remains stalled (${classification.livenessState}).`.slice(0, 1000),
          recommendedAction: "Owner intervention required — review run logs and reassign or cancel",
          autoActionTaken: "escalated",
        });
        try {
          publishLiveEvent({
            companyId: run.companyId,
            type: "activity.logged",
            payload: {
              kind: "guardian.retry_exhausted",
              runId: run.id,
              agentId: run.agentId,
              attempt,
              livenessState: classification.livenessState,
            },
          });
        } catch (err) {
          logger.error({ err, runId: run.id }, "WatchdogOne: failed to publish live event");
        }
        report.retriesExhausted += 1;
        logger.error(
          { runId: run.id, agentId: run.agentId, attempt },
          "WatchdogOne: retry exhausted — escalating",
        );
      }
      report.incidentsCreated += 1;
    }

    try {
      const blockerCount = await this.detectIssueBlockers(companyId);
      report.blockersDetected = blockerCount;
      report.incidentsCreated += blockerCount;
    } catch (err) {
      logger.error({ err }, "WatchdogOne: failed to scan issue blockers");
    }

    return report;
  }

  private async detectIssueBlockers(companyId?: string): Promise<number> {
    const cutoff = new Date(Date.now() - BLOCKER_INCIDENT_WINDOW_MS);
    const conditions = [eq(issues.status, "blocked")];
    if (companyId) {
      conditions.push(eq(issues.companyId, companyId));
    }

    const blockedIssues = await this.db
      .select({
        id: issues.id,
        companyId: issues.companyId,
        title: issues.title,
        assigneeAgentId: issues.assigneeAgentId,
        updatedAt: issues.updatedAt,
      })
      .from(issues)
      .where(and(...conditions))
      .limit(200);

    let created = 0;
    for (const issue of blockedIssues) {
      if (issue.assigneeAgentId) continue;
      const updatedAt = issue.updatedAt ? new Date(issue.updatedAt) : null;
      if (updatedAt && updatedAt.getTime() > cutoff.getTime()) continue;

      const existing = await this.db
        .select({ id: guardianIncidents.id })
        .from(guardianIncidents)
        .where(
          and(
            eq(guardianIncidents.companyId, issue.companyId),
            eq(guardianIncidents.issueId, issue.id),
            eq(guardianIncidents.incidentType, "blocker_detected"),
            eq(guardianIncidents.resolved, false),
          ),
        )
        .limit(1);
      if (existing.length > 0) continue;

      let recommended: string | null = null;
      try {
        const candidates = await this.db
          .select({ id: agents.id, name: agents.name, role: agents.role })
          .from(agents)
          .where(and(eq(agents.companyId, issue.companyId), eq(agents.status, "active")))
          .limit(5);
        if (candidates.length > 0) {
          recommended = `Consider assigning to: ${candidates
            .map((a) => a.name)
            .filter(Boolean)
            .slice(0, 3)
            .join(", ") || "an active agent"}`;
        }
      } catch (err) {
        logger.debug({ err, issueId: issue.id }, "WatchdogOne: failed to look up candidate agents");
      }

      await this.recordIncident({
        companyId: issue.companyId,
        watchdog: "watchdog_one",
        issueId: issue.id,
        incidentType: "blocker_detected",
        severity: "warning",
        description: `Issue "${issue.title}" is blocked with no assignee and has been idle for more than ${Math.round(
          BLOCKER_INCIDENT_WINDOW_MS / 60_000,
        )} minutes.`.slice(0, 1000),
        recommendedAction: recommended,
        autoActionTaken: null,
      });
      created += 1;
    }
    // Silence unused import warning when inArray is not used elsewhere.
    void inArray;
    void sql;
    return created;
  }

  private async recordIncident(input: {
    companyId: string;
    watchdog: string;
    agentId?: string | null;
    runId?: string | null;
    issueId?: string | null;
    incidentType: string;
    severity: "info" | "warning" | "critical";
    description: string;
    recommendedAction?: string | null;
    autoActionTaken?: string | null;
  }) {
    try {
      await this.db.insert(guardianIncidents).values({
        companyId: input.companyId,
        watchdog: input.watchdog,
        agentId: input.agentId ?? null,
        runId: input.runId ?? null,
        issueId: input.issueId ?? null,
        incidentType: input.incidentType,
        severity: input.severity,
        description: input.description,
        recommendedAction: input.recommendedAction ?? null,
        autoActionTaken: input.autoActionTaken ?? null,
      });
    } catch (err) {
      logger.error({ err, input }, "WatchdogOne: failed to record incident");
    }
  }
}

export function createWatchdogOne(db: Db, config: GuardianConfig) {
  return new WatchdogOne(db, config.watchdogOne);
}
