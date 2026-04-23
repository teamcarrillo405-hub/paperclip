import { api } from "./client";

export interface ChatWidgetSettings {
  companyId: string;
  welcomeMessage: string;
  agentName: string;
  brandColor: string;
  collectEmail: boolean;
  collectPhone: boolean;
}

export type ChatWidgetSettingsUpdate = Partial<
  Pick<
    ChatWidgetSettings,
    "welcomeMessage" | "agentName" | "brandColor" | "collectEmail" | "collectPhone"
  >
>;

export const chatWidgetApi = {
  getSettings: (companyId: string) =>
    api.get<ChatWidgetSettings>(`/companies/${companyId}/chat-widget-settings`),
  updateSettings: (companyId: string, patch: ChatWidgetSettingsUpdate) =>
    api.put<ChatWidgetSettings>(`/companies/${companyId}/chat-widget-settings`, patch),
};
