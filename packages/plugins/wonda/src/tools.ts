import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { WondaExecutor } from "./wonda-executor.js";
import type {
  CampaignStore,
  CampaignRecord,
  CampaignStatus,
} from "./campaigns.js";
import type {
  CompetitorAnalysisInput,
  CompetitorAnalysisResult,
  GenerateAudioJingleInput,
  GenerateCampaignInput,
  GenerateCampaignResult,
  GenerateProductImageInput,
  GeneratePromoVideoInput,
  PostCampaignContentInput,
  PostCampaignContentResult,
  WondaAssetRef,
  WondaPlatform,
} from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SKILLS_DIR = join(__dirname, "skills");

async function readSkill(name: string): Promise<string> {
  return readFile(join(SKILLS_DIR, name), "utf8");
}

export interface WondaToolContext {
  executor: WondaExecutor;
  store: CampaignStore;
  companyId: string;
  /** Optional hook to actually post to connected social accounts. */
  publisher?: (
    campaign: CampaignRecord,
    platforms: WondaPlatform[],
  ) => Promise<PostCampaignContentResult>;
}

function assetsFromResult(raw: unknown, fallback: WondaAssetRef[] = []): WondaAssetRef[] {
  if (!raw || typeof raw !== "object") return fallback;
  const maybeArr = (raw as { assets?: unknown }).assets;
  if (Array.isArray(maybeArr)) {
    return maybeArr.filter((a): a is WondaAssetRef => !!a && typeof a === "object");
  }
  return fallback;
}

/**
 * Agent tool: run_competitor_analysis(competitorUrls[])
 */
export async function runCompetitorAnalysis(
  ctx: WondaToolContext,
  input: CompetitorAnalysisInput,
): Promise<CompetitorAnalysisResult & { campaign: CampaignRecord }> {
  if (!input.competitorUrls || input.competitorUrls.length === 0) {
    throw new Error("`competitorUrls` must be a non-empty array");
  }
  const skill = await readSkill("competitor-scrape.md");
  const campaign = await ctx.store.create({
    companyId: ctx.companyId,
    name: `Competitor scan — ${new Date().toISOString().slice(0, 10)}`,
    topic: `Competitor analysis: ${input.competitorUrls.join(", ")}`,
    platforms: [],
    status: "generating",
    assets: [],
  });
  try {
    const run = await ctx.executor.runSkill({
      skillMarkdown: skill,
      variables: { competitorUrls: input.competitorUrls },
    });
    const raw = run.json as
      | { competitors?: unknown; opportunities?: unknown }
      | undefined;
    const competitors = Array.isArray(raw?.competitors)
      ? (raw!.competitors as CompetitorAnalysisResult["competitors"])
      : input.competitorUrls.map((url) => ({ url }));
    const opportunities = Array.isArray(raw?.opportunities)
      ? (raw!.opportunities as string[])
      : [];
    const updated = await ctx.store.update(ctx.companyId, campaign.id, {
      status: "ready",
      assets: run.assets,
    });
    return { competitors, opportunities, raw: run.json, campaign: updated };
  } catch (err) {
    await ctx.store.update(ctx.companyId, campaign.id, { status: "failed" });
    throw err;
  }
}

/**
 * Agent tool: generate_campaign(topic, platforms[], tone)
 */
export async function generateCampaign(
  ctx: WondaToolContext,
  input: GenerateCampaignInput,
): Promise<GenerateCampaignResult & { campaign: CampaignRecord }> {
  if (!input.topic) throw new Error("`topic` is required");
  if (!input.platforms || input.platforms.length === 0) {
    throw new Error("`platforms` must be a non-empty array");
  }
  const skill = await readSkill("social-campaign.md");
  const name = `Campaign — ${input.topic.slice(0, 60)}`;
  const campaign = await ctx.store.create({
    companyId: ctx.companyId,
    name,
    topic: input.topic,
    platforms: input.platforms,
    status: "generating",
    assets: [],
  });
  try {
    const run = await ctx.executor.runSkill({
      skillMarkdown: skill,
      variables: {
        topic: input.topic,
        platforms: input.platforms,
        tone: input.tone ?? "professional",
      },
    });
    const raw = run.json as
      | {
          campaignName?: string;
          posts?: GenerateCampaignResult["posts"];
          assets?: WondaAssetRef[];
        }
      | undefined;
    const assets = assetsFromResult(run.json, run.assets);
    const updated = await ctx.store.update(ctx.companyId, campaign.id, {
      status: "ready",
      assets,
    });
    return {
      campaignName: raw?.campaignName ?? name,
      posts: raw?.posts ?? [],
      assets,
      raw: run.json,
      campaign: updated,
    };
  } catch (err) {
    await ctx.store.update(ctx.companyId, campaign.id, { status: "failed" });
    throw err;
  }
}

/**
 * Agent tool: generate_product_image(description, style?)
 */
export async function generateProductImage(
  ctx: WondaToolContext,
  input: GenerateProductImageInput,
): Promise<{ assets: WondaAssetRef[]; campaign: CampaignRecord }> {
  if (!input.description) throw new Error("`description` is required");
  const campaign = await ctx.store.create({
    companyId: ctx.companyId,
    name: `Product image — ${input.description.slice(0, 60)}`,
    topic: input.description,
    platforms: [],
    status: "generating",
    assets: [],
  });
  try {
    const run = await ctx.executor.generateImage({
      description: input.description,
      style: input.style,
    });
    const updated = await ctx.store.update(ctx.companyId, campaign.id, {
      status: "ready",
      assets: run.assets,
    });
    return { assets: run.assets, campaign: updated };
  } catch (err) {
    await ctx.store.update(ctx.companyId, campaign.id, { status: "failed" });
    throw err;
  }
}

/**
 * Agent tool: generate_promo_video(script, voiceStyle?)
 */
export async function generatePromoVideo(
  ctx: WondaToolContext,
  input: GeneratePromoVideoInput,
): Promise<{ assets: WondaAssetRef[]; campaign: CampaignRecord }> {
  if (!input.script) throw new Error("`script` is required");
  const campaign = await ctx.store.create({
    companyId: ctx.companyId,
    name: `Promo video — ${input.script.slice(0, 60)}`,
    topic: input.script,
    platforms: [],
    status: "generating",
    assets: [],
  });
  try {
    const run = await ctx.executor.generateVideo({
      script: input.script,
      voiceStyle: input.voiceStyle,
    });
    const updated = await ctx.store.update(ctx.companyId, campaign.id, {
      status: "ready",
      assets: run.assets,
    });
    return { assets: run.assets, campaign: updated };
  } catch (err) {
    await ctx.store.update(ctx.companyId, campaign.id, { status: "failed" });
    throw err;
  }
}

/**
 * Agent tool: generate_audio_jingle(description)
 */
export async function generateAudioJingle(
  ctx: WondaToolContext,
  input: GenerateAudioJingleInput,
): Promise<{ assets: WondaAssetRef[]; campaign: CampaignRecord }> {
  if (!input.description) throw new Error("`description` is required");
  const campaign = await ctx.store.create({
    companyId: ctx.companyId,
    name: `Audio jingle — ${input.description.slice(0, 60)}`,
    topic: input.description,
    platforms: [],
    status: "generating",
    assets: [],
  });
  try {
    const run = await ctx.executor.generateAudio({ description: input.description });
    const updated = await ctx.store.update(ctx.companyId, campaign.id, {
      status: "ready",
      assets: run.assets,
    });
    return { assets: run.assets, campaign: updated };
  } catch (err) {
    await ctx.store.update(ctx.companyId, campaign.id, { status: "failed" });
    throw err;
  }
}

/**
 * Agent tool: post_campaign_content(campaignId, platforms[])
 */
export async function postCampaignContent(
  ctx: WondaToolContext,
  input: PostCampaignContentInput,
): Promise<PostCampaignContentResult & { campaign: CampaignRecord }> {
  const existing = await ctx.store.get(ctx.companyId, input.campaignId);
  if (!existing) throw new Error(`campaign ${input.campaignId} not found`);
  if (existing.status !== "ready" && existing.status !== "scheduled") {
    throw new Error(
      `campaign ${input.campaignId} is not ready to publish (status=${existing.status})`,
    );
  }

  const platforms = input.platforms?.length ? input.platforms : existing.platforms;
  await ctx.store.update(ctx.companyId, input.campaignId, { status: "publishing" });

  let result: PostCampaignContentResult = { posted: [], errors: [] };
  let finalStatus: CampaignStatus = "published";
  try {
    if (ctx.publisher) {
      result = await ctx.publisher(existing, platforms);
      if (result.errors.length > 0 && result.posted.length === 0) {
        finalStatus = "failed";
      }
    }
  } catch (err) {
    finalStatus = "failed";
    result.errors.push({
      platform: platforms[0] ?? ("unknown" as WondaPlatform),
      message: err instanceof Error ? err.message : String(err),
    });
  }

  const updated = await ctx.store.update(ctx.companyId, input.campaignId, {
    status: finalStatus,
    publishedAt: finalStatus === "published" ? new Date().toISOString() : undefined,
  });
  return { ...result, campaign: updated };
}

/**
 * Agent tool: get_campaign_status(campaignId)
 */
export async function getCampaignStatus(
  ctx: WondaToolContext,
  input: { campaignId: string },
): Promise<CampaignRecord> {
  const existing = await ctx.store.get(ctx.companyId, input.campaignId);
  if (!existing) throw new Error(`campaign ${input.campaignId} not found`);
  return existing;
}

/**
 * Agent tool: list_campaigns()
 */
export async function listCampaigns(ctx: WondaToolContext): Promise<CampaignRecord[]> {
  return ctx.store.list(ctx.companyId);
}
