import * as SecureStore from 'expo-secure-store';
import { API_URL, TOKEN_STORAGE_KEY } from '../config';

export type ApiError = {
  message: string;
  statusCode: number;
};

async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
}

async function buildHeaders(includeAuth = true): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (includeAuth) {
    const token = await getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  return headers;
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as { message?: string; error?: string };
      message = body.message ?? body.error ?? message;
    } catch {
      // ignore parse errors
    }
    const err: ApiError = { message, statusCode: response.status };
    throw err;
  }

  // 204 No Content
  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json() as Promise<T>;
}

export async function apiGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_URL}/api${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  }
  const headers = await buildHeaders();
  const response = await fetch(url.toString(), { method: 'GET', headers });
  return handleResponse<T>(response);
}

export async function apiPost<TBody, TResponse>(
  path: string,
  body: TBody,
  auth = true,
): Promise<TResponse> {
  const url = `${API_URL}/api${path}`;
  const headers = await buildHeaders(auth);
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  return handleResponse<TResponse>(response);
}

export async function apiPatch<TBody, TResponse>(
  path: string,
  body: TBody,
): Promise<TResponse> {
  const url = `${API_URL}/api${path}`;
  const headers = await buildHeaders();
  const response = await fetch(url, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(body),
  });
  return handleResponse<TResponse>(response);
}

export async function apiDelete<T>(path: string): Promise<T> {
  const url = `${API_URL}/api${path}`;
  const headers = await buildHeaders();
  const response = await fetch(url, { method: 'DELETE', headers });
  return handleResponse<T>(response);
}
