export { default as manifest, PLUGIN_ID, PLUGIN_VERSION, TOOL_NAMES } from "./manifest.js";
export { default as WondaPlugin } from "./worker.js";
export {
  WondaService,
  WondaNotInstalledError,
  WONDA_SETUP_INSTRUCTIONS,
} from "./wonda-service.js";
export {
  WondaExecutor,
  renderSkillMarkdown,
  type WondaExecutorOptions,
  type WondaSkillRunInput,
  type WondaSkillRunResult,
} from "./wonda-executor.js";
export {
  InMemoryCampaignStore,
  type CampaignStore,
  type CampaignRecord,
  type CampaignStatus,
  type CampaignPublishResult,
} from "./campaigns.js";
export {
  runCompetitorAnalysis,
  generateCampaign,
  generateProductImage,
  generatePromoVideo,
  generateAudioJingle,
  postCampaignContent,
  getCampaignStatus,
  listCampaigns,
  type WondaToolContext,
} from "./tools.js";
export * from "./types.js";
