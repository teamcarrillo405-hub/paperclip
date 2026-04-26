import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { login as apiLogin, logout as apiLogout } from '../api/auth';
import type { AuthUser, LoginPayload } from '../api/auth';
import { TOKEN_STORAGE_KEY } from '../config';

type AuthState =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'authenticated'; token: string; user: AuthUser };

type AuthContextValue = {
  state: AuthState;
  login: (payload: LoginPayload) => Promise<void>;
  logout: () => Promise<void>;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  // Restore persisted session on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync(TOKEN_STORAGE_KEY);
        if (cancelled) return;
        if (token) {
          // Minimal user stub from stored JSON alongside token
          const userJson = await SecureStore.getItemAsync(`${TOKEN_STORAGE_KEY}.user`);
          const user: AuthUser = userJson
            ? (JSON.parse(userJson) as AuthUser)
            : { id: '', email: '', name: 'User' };
          setState({ status: 'authenticated', token, user });
        } else {
          setState({ status: 'unauthenticated' });
        }
      } catch {
        setState({ status: 'unauthenticated' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (payload: LoginPayload) => {
    const result = await apiLogin(payload);
    await SecureStore.setItemAsync(TOKEN_STORAGE_KEY, result.token);
    await SecureStore.setItemAsync(
      `${TOKEN_STORAGE_KEY}.user`,
      JSON.stringify(result.user),
    );
    setState({ status: 'authenticated', token: result.token, user: result.user });
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    await SecureStore.deleteItemAsync(TOKEN_STORAGE_KEY);
    await SecureStore.deleteItemAsync(`${TOKEN_STORAGE_KEY}.user`);
    setState({ status: 'unauthenticated' });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      login,
      logout,
      user: state.status === 'authenticated' ? state.user : null,
      isAuthenticated: state.status === 'authenticated',
      isLoading: state.status === 'loading',
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
