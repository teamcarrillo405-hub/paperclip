import { client } from './client';
import type { Approval } from '../types';

export async function listApprovals(): Promise<Approval[]> {
  const res = await client.get<{ approvals: Approval[] }>('/api/mobile/approvals');
  return res.data.approvals ?? [];
}

export async function respondToApproval(
  id: string,
  approved: boolean,
  reason?: string,
): Promise<Approval> {
  const res = await client.post<Approval>(`/api/mobile/approvals/${id}/respond`, {
    approved,
    reason,
  });
  return res.data;
}

export async function registerDevice(params: {
  deviceToken: string;
  platform: 'ios' | 'android';
  userId: string;
}): Promise<void> {
  await client.post('/api/mobile/register-device', params);
}

export async function unregisterDevice(): Promise<void> {
  await client.delete('/api/mobile/unregister-device');
}
