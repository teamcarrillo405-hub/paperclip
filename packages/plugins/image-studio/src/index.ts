import type { Db } from "@paperclipai/db";
import { ImageService } from "./image-service.js";
import type { ImageStyle } from "./types.js";

export { ImageService } from "./image-service.js";
export type {
  ImageJob,
  ImageStyle,
  ImageProvider,
  ImageJobStatus,
  ComfyUIWorkflow,
  ComfyUIWorkflowNode,
  GenerateImageOptions,
} from "./types.js";

export interface AgentToolContext {
  companyId?: string;
  userId?: string;
}

export interface AgentTool<
  TArgs = Record<string, unknown>,
  TResult = unknown,
> {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  execute: (args: TArgs, ctx?: AgentToolContext) => Promise<TResult>;
}

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

const STYLE_DESCRIPTIONS: Record<ImageStyle, string> = {
  photorealistic: "Realistic photo-quality image with natural lighting",
  illustration: "Modern digital illustration with clean lines and vibrant colors",
  logo: "Professional vector-style business logo, clean and minimal",
  "social-post": "Eye-catching square image for social media feeds",
  product: "Clean product photography on a white studio background",
  banner: "Wide marketing banner suitable for websites and ads",
};

export function createImageStudioTools(db: Db): AgentTool[] {
  const service = new ImageService(db);

  const generateImage: AgentTool<
    {
      companyId?: string;
      prompt: string;
      style?: ImageStyle;
      width?: number;
      height?: number;
      negativePrompt?: string;
    }
  > = {
    name: "generate_image",
    description: "Generate an image from a text prompt using ComfyUI (self-hosted) or DALL-E 3 (fallback).",
    parametersSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        companyId: { type: "string" },
        prompt: { type: "string" },
        style: {
          type: "string",
          enum: [
            "photorealistic",
            "illustration",
            "logo",
            "social-post",
            "product",
            "banner",
          ],
        },
        width: { type: "number" },
        height: { type: "number" },
        negativePrompt: { type: "string" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.generateImage(companyId, {
        prompt: args.prompt,
        style: args.style,
        width: args.width,
        height: args.height,
        negativePrompt: args.negativePrompt,
      });
    },
  };

  const generateLogo: AgentTool<{ companyId?: string; prompt: string }> = {
    name: "generate_logo",
    description: "Generate a professional business logo image.",
    parametersSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        companyId: { type: "string" },
        prompt: { type: "string", description: "Describe the business or logo concept" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.generateImage(companyId, {
        prompt: args.prompt,
        style: "logo",
        width: 1024,
        height: 1024,
      });
    },
  };

  const generateSocialImage: AgentTool<{ companyId?: string; prompt: string }> = {
    name: "generate_social_image",
    description: "Generate an eye-catching image for a social-media post.",
    parametersSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        companyId: { type: "string" },
        prompt: { type: "string" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.generateImage(companyId, {
        prompt: args.prompt,
        style: "social-post",
        width: 1024,
        height: 1024,
      });
    },
  };

  const generateProductImage: AgentTool<{ companyId?: string; prompt: string }> = {
    name: "generate_product_image",
    description: "Generate a product or service image in clean studio style.",
    parametersSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        companyId: { type: "string" },
        prompt: { type: "string" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.generateImage(companyId, {
        prompt: args.prompt,
        style: "product",
        width: 1024,
        height: 1024,
      });
    },
  };

  const generateBanner: AgentTool<{ companyId?: string; prompt: string }> = {
    name: "generate_banner",
    description: "Generate a wide banner image for website headers or marketing.",
    parametersSchema: {
      type: "object",
      required: ["prompt"],
      properties: {
        companyId: { type: "string" },
        prompt: { type: "string" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(args, ctx);
      return service.generateImage(companyId, {
        prompt: args.prompt,
        style: "banner",
        width: 1024,
        height: 1024,
      });
    },
  };

  const getImageJob: AgentTool<{ jobId: string }> = {
    name: "get_image_job",
    description: "Return status and image URL for an image-generation job.",
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

  const listImageJobs: AgentTool<{ companyId?: string; limit?: number }> = {
    name: "list_image_jobs",
    description: "List recent image-generation jobs for a company.",
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

  const describeImageStyles: AgentTool<Record<string, never>> = {
    name: "describe_image_styles",
    description: "List the available image styles and their descriptions.",
    parametersSchema: { type: "object", properties: {} },
    async execute() {
      return Object.entries(STYLE_DESCRIPTIONS).map(([style, description]) => ({
        style,
        description,
      }));
    },
  };

  return [
    generateImage as unknown as AgentTool,
    generateLogo as unknown as AgentTool,
    generateSocialImage as unknown as AgentTool,
    generateProductImage as unknown as AgentTool,
    generateBanner as unknown as AgentTool,
    getImageJob as unknown as AgentTool,
    listImageJobs as unknown as AgentTool,
    describeImageStyles as unknown as AgentTool,
  ];
}
