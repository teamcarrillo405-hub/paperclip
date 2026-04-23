import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { listApprovals, respondToApproval } from '../api/approvals';
import type { Approval } from '../types';

const POLL_INTERVAL_MS = 30_000;

export function useApprovals() {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const data = await listApprovals();
      setApprovals(data);
      setError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load approvals';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const respond = useCallback(
    async (id: string, approved: boolean, reason?: string) => {
      const updated = await respondToApproval(id, approved, reason);
      setApprovals((prev) => prev.map((a) => (a.id === id ? updated : a)));
      return updated;
    },
    [],
  );

  const startPolling = useCallback(() => {
    if (intervalRef.current != null) return;
    intervalRef.current = setInterval(() => {
      void fetchApprovals();
    }, POLL_INTERVAL_MS);
  }, [fetchApprovals]);

  const stopPolling = useCallback(() => {
    if (intervalRef.current != null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    void fetchApprovals();
    startPolling();

    const handleAppStateChange = (state: AppStateStatus) => {
      if (state === 'active') {
        void fetchApprovals();
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
  }, [fetchApprovals, startPolling, stopPolling]);

  return { approvals, loading, error, refresh: fetchApprovals, respond };
}
