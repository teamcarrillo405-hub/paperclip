/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from "node:fs";
import path from "node:path";

export type VideoCompositionId =
  | "WeeklyReport"
  | "SocialPost"
  | "Proposal"
  | "OnboardingDemo";

export interface WeeklyReportProps {
  companyName: string;
  revenue: number;
  customers: number;
  topMetric: string;
  weekOf: string;
}

export interface SocialPostProps {
  headline: string;
  subtext: string;
  ctaText: string;
  brandColor: string;
}

export interface ProposalProps {
  companyName: string;
  proposalTitle: string;
  keyPoints: string[];
  price: number;
}

export interface OnboardingDemoProps {
  companyName: string;
  features: string[];
}

export const WEEKLY_REPORT_DURATION = 150;
export const WEEKLY_REPORT_FPS = 30;
export const SOCIAL_POST_DURATION = 90;
export const SOCIAL_POST_FPS = 30;
export const PROPOSAL_DURATION = 300;
export const PROPOSAL_FPS = 30;
export const ONBOARDING_DEMO_DURATION = 180;
export const ONBOARDING_DEMO_FPS = 30;

export interface RenderResult {
  outputPath: string;
  durationMs: number;
  placeholder: boolean;
}

/**
 * Render a composition to MP4.
 *
 * Uses @remotion/renderer if installed. Otherwise writes a placeholder
 * zero-byte .mp4 so downstream code can still track a completed job.
 */
export async function renderVideo(
  compositionId: VideoCompositionId,
  props: Record<string, unknown>,
  outputPath: string,
): Promise<RenderResult> {
  const start = Date.now();
  await fs.promises.mkdir(path.dirname(outputPath), { recursive: true });

  let renderer: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    renderer = require("@remotion/renderer");
  } catch {
    renderer = null;
  }

  if (!renderer || typeof renderer.renderMedia !== "function") {
    console.log(
      `[video-studio] Remotion renderer not installed — writing placeholder for ${compositionId} -> ${outputPath}`,
    );
    await fs.promises.writeFile(outputPath, "");
    return {
      outputPath,
      durationMs: Date.now() - start,
      placeholder: true,
    };
  }

  try {
    const entryPoint = path.resolve(__dirname, "Root.js");
    const bundleLocation =
      typeof renderer.bundle === "function"
        ? await renderer.bundle({ entryPoint })
        : entryPoint;
    const compositions =
      typeof renderer.getCompositions === "function"
        ? await renderer.getCompositions(bundleLocation, { inputProps: props })
        : [];
    const composition =
      compositions.find((c: { id: string }) => c.id === compositionId) ?? {
        id: compositionId,
        durationInFrames: 150,
        fps: 30,
        width: 1920,
        height: 1080,
      };

    await renderer.renderMedia({
      composition,
      serveUrl: bundleLocation,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: props,
      concurrency: Number(process.env.REMOTION_CONCURRENCY ?? 2),
    });

    return {
      outputPath,
      durationMs: Date.now() - start,
      placeholder: false,
    };
  } catch (err) {
    console.error(
      `[video-studio] renderMedia failed for ${compositionId}:`,
      err,
    );
    await fs.promises.writeFile(outputPath, "");
    return {
      outputPath,
      durationMs: Date.now() - start,
      placeholder: true,
    };
  }
}
