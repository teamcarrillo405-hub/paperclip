import { crewAiTools, type AgentTool } from "@paperclipai/plugin-crewai";
import { knowledgeBaseTools } from "@paperclipai/plugin-knowledge-base";
import { POSTAL_AGENT_TOOLS } from "@paperclipai/plugin-postal";
import { createVideoTools } from "@paperclipai/plugin-video";
import type { Db } from "@paperclipai/db";

export interface LocalPluginTools {
  crewai: AgentTool[];
  knowledgeBase: AgentTool[];
  postal: AgentTool[];
  video: AgentTool[];
}

export function registerLocalPluginTools(db?: Db): LocalPluginTools {
  return {
    crewai: crewAiTools,
    knowledgeBase: knowledgeBaseTools as unknown as AgentTool[],
    postal: POSTAL_AGENT_TOOLS as unknown as AgentTool[],
    video: db ? (createVideoTools(db) as unknown as AgentTool[]) : [],
  };
}

export function listLocalPluginTools(db?: Db): AgentTool[] {
  const tools = registerLocalPluginTools(db);
  return [
    ...tools.crewai,
    ...tools.knowledgeBase,
    ...tools.postal,
    ...tools.video,
  ];
}
