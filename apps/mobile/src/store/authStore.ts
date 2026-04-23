import { create } from 'zustand';
import { setAuthToken } from '../api/client';
import * as authApi from '../api/auth';
import type { User } from '../types';

interface AuthState {
  token: string | null;
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setSession: (token: string, user: User) => void;
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  loading: false,
  error: null,
  async login(email, password) {
    set({ loading: true, error: null });
    try {
      const session = await authApi.login(email, password);
      setAuthToken(session.token);
      set({ token: session.token, user: session.user, loading: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      set({ loading: false, error: message });
      throw err;
    }
  },
  async logout() {
    try {
      await authApi.logout();
    } finally {
      setAuthToken(null);
      set({ token: null, user: null });
    }
  },
  setSession(token, user) {
    setAuthToken(token);
    set({ token, user });
  },
  clear() {
    setAuthToken(null);
    set({ token: null, user: null, error: null });
  },
}));
