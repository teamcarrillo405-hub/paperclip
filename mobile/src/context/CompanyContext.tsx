import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import * as SecureStore from 'expo-secure-store';
import { fetchCompanies } from '../api/companies';
import type { Company } from '../api/companies';
import { useAuth } from './AuthContext';

const SELECTED_COMPANY_KEY = 'avero.selectedCompanyId';

type CompanyContextValue = {
  companies: Company[];
  selectedCompany: Company | null;
  selectedCompanyId: string | null;
  setSelectedCompanyId: (id: string) => Promise<void>;
  isLoading: boolean;
  refresh: () => Promise<void>;
};

const CompanyContext = createContext<CompanyContextValue | null>(null);

export function CompanyProvider({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const load = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const [list, storedId] = await Promise.all([
        fetchCompanies(),
        SecureStore.getItemAsync(SELECTED_COMPANY_KEY),
      ]);
      setCompanies(list);
      // Auto-select: stored preference or first company
      const preferred = storedId && list.some((c) => c.id === storedId)
        ? storedId
        : list[0]?.id ?? null;
      setSelectedCompanyIdState(preferred);
    } catch {
      // Network error — keep existing state (offline-tolerant)
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const setSelectedCompanyId = useCallback(async (id: string) => {
    setSelectedCompanyIdState(id);
    await SecureStore.setItemAsync(SELECTED_COMPANY_KEY, id);
  }, []);

  const selectedCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  const value = useMemo<CompanyContextValue>(
    () => ({
      companies,
      selectedCompany,
      selectedCompanyId,
      setSelectedCompanyId,
      isLoading,
      refresh: load,
    }),
    [companies, selectedCompany, selectedCompanyId, setSelectedCompanyId, isLoading, load],
  );

  return (
    <CompanyContext.Provider value={value}>{children}</CompanyContext.Provider>
  );
}

export function useCompany(): CompanyContextValue {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used within CompanyProvider');
  return ctx;
}
