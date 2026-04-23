export interface WidgetConfig {
  companyId: string;
  apiBaseUrl: string;
  welcomeMessage: string;
  agentName: string;
  brandColor: string;
  collectEmail: boolean;
  collectPhone: boolean;
}

export interface WidgetInitOptions {
  companyId: string;
  apiBaseUrl?: string;
}

export interface ChatMessage {
  role: "visitor" | "agent" | "system";
  content: string;
  createdAt: string;
}

export interface LeadPayload {
  name: string;
  email?: string;
  phone?: string;
}

declare global {
  interface Window {
    AveroChatConfig?: WidgetInitOptions;
    AveroChat?: {
      open: () => void;
      close: () => void;
      toggle: () => void;
    };
  }
}
