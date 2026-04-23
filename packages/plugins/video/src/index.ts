import type { Db } from "@paperclipai/db";
import { VideoService, type VideoJobSummary } from "./video-service.js";
import type { AgentTool, AgentToolContext } from "./tools.js";

export { VideoService, type VideoJobSummary } from "./video-service.js";
export type { AgentTool, AgentToolContext } from "./tools.js";

function requireCompanyId(
  args: { companyId?: string } | undefined,
  ctx: AgentToolContext | undefined,
): string {
  const companyId = args?.companyId ?? ctx?.companyId;
  if (!companyId) {
    throw new Error("companyId is required (pass on args or via AgentToolContext)");
  }
  return companyId;
}

export function createVideoTools(db: Db): AgentTool[] {
  const service = new VideoService(db);

  const renderWeeklyReport: AgentTool<
    {
      companyId?: string;
      companyName: string;
      revenue: number;
      customers: number;
      topMetric: string;
      weekOf: string;
    }
  > = {
    name: "render_weekly_report_video",
    description:
      "Render a short weekly business report video with revenue, customer count, and top metric for a company.",
    parametersSchema: {
      type: "object",
      required: ["companyName", "revenue", "customers", "topMetric", "weekOf"],
      properties: {
        companyId: { type: "string", description: "Company UUID (optional if in context)" },
        companyName: { type: "string" },
        revenue: { type: "number" },
        customers: { type: "number" },
        topMetric: { type: "string" },
        weekOf: { type: "string" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.renderWeeklyReport(companyId, {
        companyName: args.companyName,
        revenue: args.revenue,
        customers: args.customers,
        topMetric: args.topMetric,
        weekOf: args.weekOf,
      });
    },
  };

  const renderSocialPost: AgentTool<
    {
      companyId?: string;
      headline: string;
      subtext: string;
      ctaText: string;
      brandColor?: string;
    }
  > = {
    name: "render_social_post_video",
    description:
      "Render a short social-media video (square format) with headline, subtext, and call-to-action.",
    parametersSchema: {
      type: "object",
      required: ["headline", "subtext", "ctaText"],
      properties: {
        companyId: { type: "string" },
        headline: { type: "string" },
        subtext: { type: "string" },
        ctaText: { type: "string" },
        brandColor: { type: "string", description: "Hex color, e.g. #2563eb" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.renderSocialPost(companyId, {
        headline: args.headline,
        subtext: args.subtext,
        ctaText: args.ctaText,
        brandColor: args.brandColor ?? "#2563eb",
      });
    },
  };

  const renderProposal: AgentTool<
    {
      companyId?: string;
      companyName: string;
      proposalTitle: string;
      keyPoints: string[];
      price: number;
    }
  > = {
    name: "render_proposal_video",
    description:
      "Render a proposal / pitch video with a title card, three bullet points, and a pricing slide.",
    parametersSchema: {
      type: "object",
      required: ["companyName", "proposalTitle", "keyPoints", "price"],
      properties: {
        companyId: { type: "string" },
        companyName: { type: "string" },
        proposalTitle: { type: "string" },
        keyPoints: { type: "array", items: { type: "string" } },
        price: { type: "number" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.renderProposal(companyId, {
        companyName: args.companyName,
        proposalTitle: args.proposalTitle,
        keyPoints: args.keyPoints,
        price: args.price,
      });
    },
  };

  const renderOnboardingDemo: AgentTool<
    {
      companyId?: string;
      companyName: string;
      features: string[];
    }
  > = {
    name: "render_onboarding_demo_video",
    description:
      "Render an onboarding walkthrough video that introduces the company and its top features.",
    parametersSchema: {
      type: "object",
      required: ["companyName", "features"],
      properties: {
        companyId: { type: "string" },
        companyName: { type: "string" },
        features: { type: "array", items: { type: "string" } },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.renderOnboardingDemo(companyId, {
        companyName: args.companyName,
        features: args.features,
      });
    },
  };

  const getVideoJobStatus: AgentTool<{ jobId: string }> = {
    name: "get_video_job_status",
    description: "Return the current status of a video render job by ID.",
    parametersSchema: {
      type: "object",
      required: ["jobId"],
      properties: {
        jobId: { type: "string" },
      },
    },
    async execute(args) {
      return service.getJobStatus(args.jobId);
    },
  };

  const listVideoJobs: AgentTool<{ companyId?: string; limit?: number }> = {
    name: "list_video_jobs",
    description: "List the most recent video render jobs for a company.",
    parametersSchema: {
      type: "object",
      properties: {
        companyId: { type: "string" },
        limit: { type: "number", description: "Maximum number of rows (default 20)" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.listJobs(companyId, args.limit ?? 20);
    },
  };

  return [
    renderWeeklyReport as unknown as AgentTool,
    renderSocialPost as unknown as AgentTool,
    renderProposal as unknown as AgentTool,
    renderOnboardingDemo as unknown as AgentTool,
    getVideoJobStatus as unknown as AgentTool,
    listVideoJobs as unknown as AgentTool,
  ];
}
