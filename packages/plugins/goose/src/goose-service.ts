import { randomUUID } from "node:crypto";
import {
  GooseNotInstalledError,
  spawnGooseTask,
  type GooseRunningProcess,
} from "./goose-executor.js";
import type {
  GooseRunOptions,
  GooseTaskRecord,
  GooseTaskStatus,
} from "./types.js";

export interface GooseTaskPersistence {
  insertRunning(task: GooseTaskRecord): Promise<void>;
  appendOutput(taskId: string, output: string): Promise<void>;
  finalize(
    taskId: string,
    patch: {
      status: GooseTaskStatus;
      output: string;
      completedAt: Date;
    },
  ): Promise<void>;
  findById(taskId: string): Promise<GooseTaskRecord | null>;
  listByCompany(
    companyId: string,
    opts?: { status?: GooseTaskStatus; limit?: number },
  ): Promise<GooseTaskRecord[]>;
}

export interface GooseServiceOptions {
  persistence?: GooseTaskPersistence;
  binary?: string;
}

interface RunningTaskEntry {
  record: GooseTaskRecord;
  process: GooseRunningProcess;
  completion: Promise<GooseTaskRecord>;
}

/**
 * GooseService owns the in-memory Map of taskId → running child process and
 * coordinates optional persistence. If no persistence is supplied, tasks live
 * only in memory (plugin-worker-only usage).
 */
export class GooseService {
  private readonly tasks = new Map<string, RunningTaskEntry>();
  private readonly inMemoryFinished = new Map<string, GooseTaskRecord>();

  constructor(private readonly opts: GooseServiceOptions = {}) {}

  /** Start a new Goose task. Resolves once the task is registered (not done). */
  async startTask(options: GooseRunOptions): Promise<GooseTaskRecord> {
    const now = new Date();
    const taskId = randomUUID();
    const fullInstructions = options.context
      ? `${options.instructions}\n\nContext:\n${options.context}`
      : options.instructions;

    let proc: GooseRunningProcess;
    try {
      proc = spawnGooseTask(fullInstructions, { binary: this.opts.binary });
    } catch (err) {
      if (err instanceof GooseNotInstalledError) {
        const failed: GooseTaskRecord = {
          id: taskId,
          companyId: options.companyId,
          instructions: options.instructions,
          templateName: options.templateName ?? null,
          status: "failed",
          output: err.message,
          startedAt: now,
          completedAt: now,
          createdAt: now,
        };
        if (this.opts.persistence) {
          await this.opts.persistence.insertRunning({ ...failed, status: "running", output: "", completedAt: null });
          await this.opts.persistence.finalize(taskId, {
            status: "failed",
            output: err.message,
            completedAt: now,
          });
        } else {
          this.inMemoryFinished.set(taskId, failed);
        }
        return failed;
      }
      throw err;
    }

    const record: GooseTaskRecord = {
      id: taskId,
      companyId: options.companyId,
      instructions: options.instructions,
      templateName: options.templateName ?? null,
      status: "running",
      output: "",
      startedAt: now,
      completedAt: null,
      createdAt: now,
    };

    if (this.opts.persistence) {
      await this.opts.persistence.insertRunning(record);
    }

    const completion = proc.result.then(async (exec) => {
      const completedAt = new Date();
      const finalStatus: GooseTaskStatus = exec.status;
      const updated: GooseTaskRecord = {
        ...record,
        status: finalStatus,
        output: exec.output,
        completedAt,
      };
      if (this.opts.persistence) {
        await this.opts.persistence.finalize(taskId, {
          status: finalStatus,
          output: exec.output,
          completedAt,
        });
      } else {
        this.inMemoryFinished.set(taskId, updated);
      }
      this.tasks.delete(taskId);
      return updated;
    });

    this.tasks.set(taskId, { record, process: proc, completion });
    return record;
  }

  async getTask(taskId: string): Promise<GooseTaskRecord | null> {
    const running = this.tasks.get(taskId);
    if (running) return running.record;
    if (this.opts.persistence) {
      return this.opts.persistence.findById(taskId);
    }
    return this.inMemoryFinished.get(taskId) ?? null;
  }

  /** Returns just the textual output of a task, across running/finished. */
  async getOutput(taskId: string): Promise<string | null> {
    const record = await this.getTask(taskId);
    return record ? record.output : null;
  }

  async cancelTask(taskId: string): Promise<GooseTaskRecord | null> {
    const running = this.tasks.get(taskId);
    if (!running) {
      return this.getTask(taskId);
    }
    running.process.kill();
    const final = await running.completion;
    if (final.status === "completed") {
      return final;
    }
    if (final.status !== "cancelled") {
      const cancelled: GooseTaskRecord = { ...final, status: "cancelled" };
      if (this.opts.persistence) {
        await this.opts.persistence.finalize(taskId, {
          status: "cancelled",
          output: final.output,
          completedAt: final.completedAt ?? new Date(),
        });
      } else {
        this.inMemoryFinished.set(taskId, cancelled);
      }
      return cancelled;
    }
    return final;
  }

  async listTasks(
    companyId: string,
    opts?: { status?: GooseTaskStatus; limit?: number },
  ): Promise<GooseTaskRecord[]> {
    if (this.opts.persistence) {
      return this.opts.persistence.listByCompany(companyId, opts);
    }
    const all: GooseTaskRecord[] = [];
    for (const entry of this.tasks.values()) {
      if (entry.record.companyId === companyId) all.push(entry.record);
    }
    for (const rec of this.inMemoryFinished.values()) {
      if (rec.companyId === companyId) all.push(rec);
    }
    const filtered = opts?.status ? all.filter((r) => r.status === opts.status) : all;
    filtered.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return typeof opts?.limit === "number" ? filtered.slice(0, opts.limit) : filtered;
  }

  /** Await the completion of a running task. For tests. */
  async waitForCompletion(taskId: string): Promise<GooseTaskRecord | null> {
    const running = this.tasks.get(taskId);
    if (!running) return this.getTask(taskId);
    return running.completion;
  }
}
