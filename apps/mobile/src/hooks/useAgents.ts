import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { listAgents } from '../api/agents';
import type { Agent } from '../types';

const POLL_INTERVAL_MS = 30_000;

export function useAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchAgents = useCallback(async () => {
    try {
      const data = await listAgents();
      setAgents(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load agents';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const startPolling = useCallback(() => {
    if (intervalRef.current != null) return;
    intervalRef.current = setInterval(() => {
      void fetchAgents();
    }, POLL_INTERVAL_MS);
  }, [fetchAgents]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    void fetchAgents();
    startPolling();

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void fetchAgents();
        startPolling();
      } else {
        stopPolling();
      }
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      sub.remove();
      stopPolling();
    };
  }, [fetchAgents, startPolling, stopPolling]);

  return { agents, loading, error, refresh: fetchAgents };
}
