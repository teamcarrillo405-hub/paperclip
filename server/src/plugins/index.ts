import { crewAiTools, type AgentTool } from "@paperclipai/plugin-crewai";

export interface LocalPluginTools {
  crewai: AgentTool[];
}

export function registerLocalPluginTools(): LocalPluginTools {
  return {
    crewai: crewAiTools,
  };
}

export function listLocalPluginTools(): AgentTool[] {
  const tools = registerLocalPluginTools();
  return [...tools.crewai];
}
