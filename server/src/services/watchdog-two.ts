import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  guardianIncidents,
  heartbeatRuns,
  issueComments,
  workspaceOperations,
} from "@paperclipai/db";
import { logger } from "../middleware/logger.js";
import type { GuardianConfig, WatchdogTwoConfig } from "./guardian-config.js";

export interface WatchdogTwoReport {
  scannedRuns: number;
  reviewedRuns: number;
  incidentsCreated: number;
  escalations: number;
  ranAt: string;
}

const REVIEW_LOOKBACK_MS = 10 * 60 * 1000;
const PATTERN_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const PATTERN_THRESHOLD = 10;
const ERROR_KEYWORDS = [
  "error",
  "exception",
  "traceback",
  "failed",
  "fatal",
  "assertion",
  "panic",
];

type WatchdogTwoIncidentInput = {
  companyId: string;
  watchdog: string;
  agentId?: string | null;
  runId?: string | null;
  incidentType: string;
  severity: "info" | "warning" | "critical";
  description: string;
  recommendedAction?: string | null;
};

export class WatchdogTwo {
  private readonly db: Db;
  private readonly config: WatchdogTwoConfig;
  private lastReport: WatchdogTwoReport | null = null;
  private lastRunAt: Date | null = null;

  constructor(db: Db, config: WatchdogTwoConfig) {
    this.db = db;
    this.config = config;
  }

  getLastReport(): WatchdogTwoReport | null {
    return this.lastReport;
  }

  getLastRunAt(): Date | null {
    return this.lastRunAt;
  }

  async tick(): Promise<WatchdogTwoReport> {
    const report = await this.reviewCompletedRuns();
    this.lastReport = report;
    this.lastRunAt = new Date();
    return report;
  }

  async reviewCompletedRuns(companyId?: string): Promise<WatchdogTwoReport> {
    const report: WatchdogTwoReport = {
      scannedRuns: 0,
      reviewedRuns: 0,
      incidentsCreated: 0,
      escalations: 0,
      ranAt: new Date().toISOString(),
    };

    const minFinishedAt = new Date(Date.now() - REVIEW_LOOKBACK_MS);
    const delayCutoff = new Date(Date.now() - this.config.qualityCheckDelayMs);

    const conditions = [
      inArray(heartbeatRuns.status, ["succeeded", "failed", "timed_out"]),
      gte(heartbeatRuns.finishedAt, minFinishedAt),
    ];
    if (companyId) {
      conditions.push(eq(heartbeatRuns.companyId, companyId));
    }

    const runs = await this.db
      .select()
      .from(heartbeatRuns)
      .where(and(...conditions))
      .limit(500);

    report.scannedRuns = runs.length;

    for (const run of runs) {
      if (!run.finishedAt) continue;
      if (new Date(run.finishedAt).getTime() > delayCutoff.getTime()) continue;

      const snapshot = (run.contextSnapshot ?? {}) as Record<string, unknown>;
      if (typeof snapshot.watchdogTwoReviewedAt === "string") continue;

      const incidents = await this.evaluateRun(run);
      for (const incident of incidents) {
        await this.recordIncident(incident);
        report.incidentsCreated += 1;
      }

      const patternEscalated = await this.maybeEscalatePattern(run);
      if (patternEscalated) report.escalations += 1;

      try {
        await this.db
          .update(heartbeatRuns)
          .set({
            contextSnapshot: {
              ...snapshot,
              watchdogTwoReviewedAt: new Date().toISOString(),
            },
            updatedAt: new Date(),
          })
          .where(eq(heartbeatRuns.id, run.id));
        report.reviewedRuns += 1;
      } catch (err) {
        logger.error({ err, runId: run.id }, "WatchdogTwo: failed to mark run reviewed");
      }
    }

    return report;
  }

  private async evaluateRun(run: typeof heartbeatRuns.$inferSelect): Promise<WatchdogTwoIncidentInput[]> {
    const incidents: WatchdogTwoIncidentInput[] = [];
    const runIdShort = run.id.slice(0, 8);

    if (run.livenessState === "plan_only") {
      incidents.push({
        companyId: run.companyId,
        watchdog: "watchdog_two",
        agentId: run.agentId,
        runId: run.id,
        incidentType: "quality_regression",
        severity: "warning",
        description: `Run ${runIdShort}: Agent produced a plan but no artifacts (plan_only).`,
        recommendedAction: "Review agent instructions — the agent may need clearer execution guidance.",
      });
    }

    if ((run.continuationAttempt ?? 0) > 1) {
      incidents.push({
        companyId: run.companyId,
        watchdog: "watchdog_two",
        agentId: run.agentId,
        runId: run.id,
        incidentType: "improvement_suggestion",
        severity: "info",
        description: `Run ${runIdShort}: Required ${run.continuationAttempt} continuation attempts to complete.`,
        recommendedAction: "Consider refining agent instructions to reduce retry count.",
      });
    }

    const stderr = (run.stderrExcerpt ?? "").toLowerCase();
    if (stderr) {
      const hit = ERROR_KEYWORDS.find((k) => stderr.includes(k));
      if (hit) {
        const excerpt = (run.stderrExcerpt ?? "").slice(0, 400);
        incidents.push({
          companyId: run.companyId,
          watchdog: "watchdog_two",
          agentId: run.agentId,
          runId: run.id,
          incidentType: "quality_regression",
          severity: "warning",
          description: `Run ${runIdShort}: stderr contains error keyword "${hit}". Excerpt: ${excerpt}`,
          recommendedAction: "Inspect run logs for root cause.",
        });
      }
    }

    if (run.status === "succeeded" && run.resultJson) {
      const [workspaceOpsRow] = await this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(workspaceOperations)
        .where(eq(workspaceOperations.heartbeatRunId, run.id));
      const workspaceOps = Number(workspaceOpsRow?.count ?? 0);

      const [commentsRow] = await this.db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(issueComments)
        .where(eq(issueComments.createdByRunId, run.id));
      const comments = Number(commentsRow?.count ?? 0);

      if (workspaceOps === 0 && comments === 0) {
        incidents.push({
          companyId: run.companyId,
          watchdog: "watchdog_two",
          agentId: run.agentId,
          runId: run.id,
          incidentType: "improvement_suggestion",
          severity: "info",
          description: `Run ${runIdShort}: Completed successfully but produced no workspace operations or issue comments.`,
          recommendedAction: "Verify the agent's task produced meaningful output; consider updating instructions.",
        });
      }
    }

    return incidents;
  }

  private async maybeEscalatePattern(run: typeof heartbeatRuns.$inferSelect): Promise<boolean> {
    if (!run.agentId) return false;
    const windowStart = new Date(Date.now() - PATTERN_LOOKBACK_MS);
    const rows = await this.db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(guardianIncidents)
      .where(
        and(
          eq(guardianIncidents.companyId, run.companyId),
          eq(guardianIncidents.agentId, run.agentId),
          eq(guardianIncidents.incidentType, "improvement_suggestion"),
          gte(guardianIncidents.createdAt, windowStart),
        ),
      );
    const count = Number(rows[0]?.count ?? 0);
    if (count < PATTERN_THRESHOLD) return false;
    if (count % PATTERN_THRESHOLD !== 0) return false;

    await this.recordIncident({
      companyId: run.companyId,
      watchdog: "watchdog_two",
      agentId: run.agentId,
      incidentType: "quality_regression",
      severity: "critical",
      description: `Agent has accumulated ${count} improvement_suggestion incidents in the last 24h — a quality pattern is emerging.`,
      recommendedAction: "Pause the agent and review its instructions or adapter configuration.",
    });
    logger.warn(
      { agentId: run.agentId, companyId: run.companyId, count },
      "WatchdogTwo: escalated improvement_suggestion pattern to critical",
    );

    if (process.env.AIDER_AUTO_FIX_ENABLED === "true") {
      const errorPattern = (run.stderrExcerpt ?? "").slice(0, 400) || "quality regression pattern";
      await this.recordIncident({
        companyId: run.companyId,
        watchdog: "watchdog_two",
        agentId: run.agentId,
        incidentType: "aider_fix_dispatched",
        severity: "info",
        description: `Aider auto-fix dispatched for recurring error pattern (${count} incidents in 24h): ${errorPattern}`,
        recommendedAction:
          "An Aider run has been queued to investigate this pattern. Pick up the incident from the Dev Tools page.",
      });
      logger.info(
        { agentId: run.agentId, companyId: run.companyId, count },
        "WatchdogTwo: aider_fix_dispatched incident logged (AIDER_AUTO_FIX_ENABLED=true)",
      );
    }

    return true;
  }

  private async recordIncident(input: WatchdogTwoIncidentInput) {
    try {
      await this.db.insert(guardianIncidents).values({
        companyId: input.companyId,
        watchdog: input.watchdog,
        agentId: input.agentId ?? null,
        runId: input.runId ?? null,
        issueId: null,
        incidentType: input.incidentType,
        severity: input.severity,
        description: input.description.slice(0, 1500),
        recommendedAction: input.recommendedAction ?? null,
        autoActionTaken: null,
      });
    } catch (err) {
      logger.error({ err, input }, "WatchdogTwo: failed to record incident");
    }
  }
}

export function createWatchdogTwo(db: Db, config: GuardianConfig) {
  return new WatchdogTwo(db, config.watchdogTwo);
}
