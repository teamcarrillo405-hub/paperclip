import { apiPost } from './client';

export type LoginPayload = {
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role?: string;
};

export type LoginResponse = {
  token: string;
  user: AuthUser;
};

export async function login(payload: LoginPayload): Promise<LoginResponse> {
  // Better Auth sign-in endpoint
  return apiPost<LoginPayload, LoginResponse>(
    '/auth/sign-in/email',
    payload,
    false,
  );
}

export async function logout(): Promise<void> {
  try {
    await apiPost('/auth/sign-out', {});
  } catch {
    // Ignore server errors on logout — local token is cleared regardless
  }
}
