import { client } from './client';
import type { Agent } from '../types';

export async function listAgents(): Promise<Agent[]> {
  const res = await client.get<{ agents: Agent[] }>('/api/agents');
  return res.data.agents ?? [];
}

export async function getAgent(id: string): Promise<Agent> {
  const res = await client.get<Agent>(`/api/agents/${id}`);
  return res.data;
}
