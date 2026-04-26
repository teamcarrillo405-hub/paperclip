import { apiGet, apiPost } from './client';

export type Agent = {
  id: string;
  companyId: string;
  name: string;
  description?: string;
  avatarUrl?: string;
  lastActiveAt?: string;
  status?: 'online' | 'idle' | 'offline';
};

export type ChatMessage = {
  id: string;
  role: 'user' | 'agent';
  content: string;
  createdAt: string;
};

export type SendMessagePayload = {
  agentId: string;
  companyId: string;
  message: string;
};

export type SendMessageResponse = {
  issueId: string;
  reply: string;
  message: ChatMessage;
};

export async function fetchAgents(companyId: string): Promise<Agent[]> {
  return apiGet<Agent[]>('/agents', { companyId });
}

export async function fetchAgent(id: string): Promise<Agent> {
  return apiGet<Agent>(`/agents/${id}`);
}

export async function sendMessageToAgent(
  payload: SendMessagePayload,
): Promise<SendMessageResponse> {
  return apiPost<SendMessagePayload, SendMessageResponse>(
    '/issues',
    {
      companyId: payload.companyId,
      title: payload.message.slice(0, 80),
      description: payload.message,
      assignedAgentId: payload.agentId,
    },
  );
}
