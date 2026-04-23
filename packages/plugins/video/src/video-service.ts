import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import {
  videoRenders,
  type Db,
  type VideoRenderRow,
  type VideoRenderStatus,
} from "@paperclipai/db";
import {
  renderVideo,
  type VideoCompositionId,
  type WeeklyReportProps,
  type SocialPostProps,
  type ProposalProps,
  type OnboardingDemoProps,
} from "@paperclipai/video-studio";

export interface VideoServiceOptions {
  outputDir?: string;
}

export interface VideoJobSummary {
  id: string;
  companyId: string;
  compositionId: string;
  status: VideoRenderStatus;
  outputPath: string | null;
  error: string | null;
  durationMs: number | null;
  createdAt: Date;
  completedAt: Date | null;
}

function toSummary(row: VideoRenderRow): VideoJobSummary {
  return {
    id: row.id,
    companyId: row.companyId,
    compositionId: row.compositionId,
    status: row.status,
    outputPath: row.outputPath,
    error: row.error,
    durationMs: row.durationMs,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

export class VideoService {
  private readonly db: Db;
  private readonly outputDir: string;

  constructor(db: Db, opts: VideoServiceOptions = {}) {
    this.db = db;
    this.outputDir =
      opts.outputDir ??
      process.env.VIDEO_OUTPUT_DIR ??
      path.resolve(process.cwd(), "storage/videos");
  }

  async renderWeeklyReport(companyId: string, props: WeeklyReportProps) {
    return this.enqueueAndRender(companyId, "WeeklyReport", props as unknown as Record<string, unknown>);
  }

  async renderSocialPost(companyId: string, props: SocialPostProps) {
    return this.enqueueAndRender(companyId, "SocialPost", props as unknown as Record<string, unknown>);
  }

  async renderProposal(companyId: string, props: ProposalProps) {
    return this.enqueueAndRender(companyId, "Proposal", props as unknown as Record<string, unknown>);
  }

  async renderOnboardingDemo(companyId: string, props: OnboardingDemoProps) {
    return this.enqueueAndRender(companyId, "OnboardingDemo", props as unknown as Record<string, unknown>);
  }

  async getJobStatus(jobId: string): Promise<VideoJobSummary | null> {
    const [row] = await this.db
      .select()
      .from(videoRenders)
      .where(eq(videoRenders.id, jobId))
      .limit(1);
    return row ? toSummary(row) : null;
  }

  async listJobs(companyId: string, limit = 20): Promise<VideoJobSummary[]> {
    const rows = await this.db
      .select()
      .from(videoRenders)
      .where(eq(videoRenders.companyId, companyId))
      .orderBy(desc(videoRenders.createdAt))
      .limit(limit);
    return rows.map(toSummary);
  }

  async getJobForCompany(
    companyId: string,
    jobId: string,
  ): Promise<VideoJobSummary | null> {
    const [row] = await this.db
      .select()
      .from(videoRenders)
      .where(and(eq(videoRenders.id, jobId), eq(videoRenders.companyId, companyId)))
      .limit(1);
    return row ? toSummary(row) : null;
  }

  private async enqueueAndRender(
    companyId: string,
    compositionId: VideoCompositionId,
    props: Record<string, unknown>,
  ): Promise<{ jobId: string; status: VideoRenderStatus }> {
    const [inserted] = await this.db
      .insert(videoRenders)
      .values({
        companyId,
        compositionId,
        props,
        status: "queued",
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert video render job");
    }

    const jobId = inserted.id;
    void this.doRender(jobId, compositionId, props).catch((err) => {
      console.error("[video-service] render failed", { jobId, err });
    });
    return { jobId, status: "queued" };
  }

  private async doRender(
    jobId: string,
    compositionId: VideoCompositionId,
    props: Record<string, unknown>,
  ): Promise<void> {
    await this.db
      .update(videoRenders)
      .set({ status: "rendering" })
      .where(eq(videoRenders.id, jobId));

    const outputPath = path.join(this.outputDir, `${jobId}.mp4`);
    try {
      const result = await renderVideo(compositionId, props, outputPath);
      await this.db
        .update(videoRenders)
        .set({
          status: "completed",
          outputPath: result.outputPath,
          durationMs: result.durationMs,
          completedAt: new Date(),
        })
        .where(eq(videoRenders.id, jobId));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.db
        .update(videoRenders)
        .set({
          status: "failed",
          error: message,
          completedAt: new Date(),
        })
        .where(eq(videoRenders.id, jobId));
    }
  }
}
