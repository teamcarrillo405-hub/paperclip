import { client, setAuthToken } from './client';
import type { AuthSession } from '../types';

export async function login(email: string, password: string): Promise<AuthSession> {
  const res = await client.post<AuthSession>('/api/auth/login', { email, password });
  setAuthToken(res.data.token);
  return res.data;
}

export async function logout(): Promise<void> {
  try {
    await client.post('/api/auth/logout');
  } finally {
    setAuthToken(null);
  }
}

export async function me(): Promise<AuthSession> {
  const res = await client.get<AuthSession>('/api/auth/me');
  return res.data;
}
