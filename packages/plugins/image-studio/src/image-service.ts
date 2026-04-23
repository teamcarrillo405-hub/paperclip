import { desc, eq } from "drizzle-orm";
import { imageJobs, type Db, type ImageJobRow } from "@paperclipai/db";
import type {
  ComfyUIWorkflow,
  GenerateImageOptions,
  ImageJob,
  ImageProvider,
  ImageStyle,
} from "./types.js";

const STYLE_PROMPT_PREFIXES: Record<ImageStyle, string> = {
  photorealistic:
    "high-quality photorealistic image, sharp focus, natural lighting, ",
  illustration:
    "modern digital illustration, clean lines, vibrant colors, ",
  logo:
    "professional vector logo design, clean, minimal, flat style, centered on white background, ",
  "social-post":
    "eye-catching social media post, bold composition, vibrant colors, ",
  product:
    "clean product photography, studio lighting, white background, commercial quality, ",
  banner:
    "wide marketing banner composition, bold typography space, professional, ",
};

function toImageJob(row: ImageJobRow): ImageJob {
  return {
    id: row.id,
    companyId: row.companyId,
    prompt: row.prompt,
    enhancedPrompt: row.enhancedPrompt,
    style: row.style as ImageStyle,
    width: row.width,
    height: row.height,
    status: row.status,
    imageUrl: row.imageUrl,
    provider: row.provider,
    error: row.error,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

async function poll<T>(
  fn: () => Promise<T | null>,
  intervalMs: number,
  maxAttempts: number,
): Promise<T | null> {
  for (let i = 0; i < maxAttempts; i++) {
    const result = await fn();
    if (result !== null) return result;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  return null;
}

export class ImageService {
  private readonly db: Db;
  private readonly comfyUrl: string | undefined;
  private readonly provider: ImageProvider;

  constructor(db: Db) {
    this.db = db;
    this.comfyUrl = process.env.COMFYUI_INTERNAL_URL;
    this.provider = this.comfyUrl ? "comfyui" : "dalle3";
  }

  getProvider(): ImageProvider {
    return this.provider;
  }

  getStylePromptPrefix(style: ImageStyle): string {
    return STYLE_PROMPT_PREFIXES[style] ?? "";
  }

  async generateImage(
    companyId: string,
    options: GenerateImageOptions,
  ): Promise<ImageJob> {
    const style = options.style ?? "photorealistic";
    const width = options.width ?? 1024;
    const height = options.height ?? 1024;
    const enhancedPrompt = `${this.getStylePromptPrefix(style)}${options.prompt}`;

    const [inserted] = await this.db
      .insert(imageJobs)
      .values({
        companyId,
        prompt: options.prompt,
        enhancedPrompt,
        style,
        width,
        height,
        status: "generating",
        provider: this.provider,
      })
      .returning();

    if (!inserted) {
      throw new Error("Failed to insert image job");
    }

    const jobId = inserted.id;

    try {
      const imageUrl = this.comfyUrl
        ? await this.generateViaComfyUI(enhancedPrompt, options.negativePrompt, width, height)
        : await this.generateViaDallE(enhancedPrompt);

      const [updated] = await this.db
        .update(imageJobs)
        .set({
          status: "completed",
          imageUrl,
          completedAt: new Date(),
        })
        .where(eq(imageJobs.id, jobId))
        .returning();

      return toImageJob(updated ?? inserted);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const [updated] = await this.db
        .update(imageJobs)
        .set({
          status: "failed",
          error: message,
          completedAt: new Date(),
        })
        .where(eq(imageJobs.id, jobId))
        .returning();
      return toImageJob(updated ?? inserted);
    }
  }

  async getJobStatus(jobId: string): Promise<ImageJob | null> {
    const [row] = await this.db
      .select()
      .from(imageJobs)
      .where(eq(imageJobs.id, jobId))
      .limit(1);
    return row ? toImageJob(row) : null;
  }

  async listJobs(companyId: string, limit = 20): Promise<ImageJob[]> {
    const rows = await this.db
      .select()
      .from(imageJobs)
      .where(eq(imageJobs.companyId, companyId))
      .orderBy(desc(imageJobs.createdAt))
      .limit(limit);
    return rows.map(toImageJob);
  }

  private buildBasicWorkflow(
    prompt: string,
    negativePrompt: string,
    width: number,
    height: number,
  ): ComfyUIWorkflow {
    return {
      prompt: {
        "3": {
          class_type: "KSampler",
          inputs: {
            seed: Math.floor(Math.random() * 1_000_000_000),
            steps: 20,
            cfg: 7,
            sampler_name: "euler",
            scheduler: "normal",
            denoise: 1,
            model: ["4", 0],
            positive: ["6", 0],
            negative: ["7", 0],
            latent_image: ["5", 0],
          },
        },
        "4": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "sd_xl_base_1.0.safetensors" },
        },
        "5": {
          class_type: "EmptyLatentImage",
          inputs: { width, height, batch_size: 1 },
        },
        "6": {
          class_type: "CLIPTextEncode",
          inputs: { text: prompt, clip: ["4", 1] },
        },
        "7": {
          class_type: "CLIPTextEncode",
          inputs: { text: negativePrompt, clip: ["4", 1] },
        },
        "8": {
          class_type: "VAEDecode",
          inputs: { samples: ["3", 0], vae: ["4", 2] },
        },
        "9": {
          class_type: "SaveImage",
          inputs: { filename_prefix: "paperclip", images: ["8", 0] },
        },
      },
    };
  }

  private async generateViaComfyUI(
    prompt: string,
    negativePrompt: string | undefined,
    width: number,
    height: number,
  ): Promise<string> {
    if (!this.comfyUrl) {
      throw new Error("COMFYUI_INTERNAL_URL not configured");
    }
    const workflow = this.buildBasicWorkflow(
      prompt,
      negativePrompt ?? "blurry, low-quality, watermark, text",
      width,
      height,
    );

    const submitRes = await fetch(`${this.comfyUrl}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(workflow),
    });
    if (!submitRes.ok) {
      throw new Error(`ComfyUI submit failed: ${submitRes.status} ${submitRes.statusText}`);
    }
    const submitJson = (await submitRes.json()) as { prompt_id?: string };
    const promptId = submitJson.prompt_id;
    if (!promptId) {
      throw new Error("ComfyUI did not return a prompt_id");
    }

    const historyEntry = await poll(async () => {
      const res = await fetch(`${this.comfyUrl}/history/${promptId}`);
      if (!res.ok) return null;
      const json = (await res.json()) as Record<string, unknown>;
      const entry = json[promptId] as
        | { outputs?: Record<string, { images?: Array<{ filename: string; subfolder?: string; type?: string }> }> }
        | undefined;
      if (!entry || !entry.outputs) return null;
      return entry;
    }, 2000, 60);

    if (!historyEntry || !historyEntry.outputs) {
      throw new Error("ComfyUI generation timed out");
    }

    for (const output of Object.values(historyEntry.outputs)) {
      const image = output.images?.[0];
      if (image) {
        const params = new URLSearchParams({
          filename: image.filename,
          subfolder: image.subfolder ?? "",
          type: image.type ?? "output",
        });
        return `${this.comfyUrl}/view?${params.toString()}`;
      }
    }
    throw new Error("ComfyUI returned no images");
  }

  private async generateViaDallE(prompt: string): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY not configured; cannot generate via DALL-E 3");
    }
    const { default: OpenAI } = await import("openai");
    const client = new OpenAI({ apiKey });
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt,
      size: "1024x1024",
      n: 1,
    });
    const url = response.data?.[0]?.url;
    if (!url) {
      throw new Error("DALL-E 3 returned no image URL");
    }
    return url;
  }
}
