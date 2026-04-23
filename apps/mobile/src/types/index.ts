export type AgentStatus = 'running' | 'idle' | 'error' | 'paused';

export interface Agent {
  id: string;
  name: string;
  role?: string;
  status: AgentStatus;
  lastActivityAt?: string;
  description?: string;
}

export type ApprovalStatus = 'pending' | 'approved' | 'denied' | 'expired';

export interface Approval {
  id: string;
  title: string;
  summary?: string;
  status: ApprovalStatus;
  agentId?: string;
  agentName?: string;
  createdAt: string;
  expiresAt?: string;
  details?: string;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  companyId: string;
}

export interface AuthSession {
  token: string;
  user: User;
}
