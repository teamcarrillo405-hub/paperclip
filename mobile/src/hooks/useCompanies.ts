import { useQuery } from '@tanstack/react-query';
import { fetchCompanies } from '../api/companies';
import { useAuth } from '../context/AuthContext';

export function useCompanies() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: ['companies'],
    queryFn: fetchCompanies,
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000,
  });
}
