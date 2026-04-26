import { useQuery } from '@tanstack/react-query';
import { fetchAgents, fetchAgent } from '../api/agents';
import { useCompany } from '../context/CompanyContext';

export function useAgents() {
  const { selectedCompanyId } = useCompany();

  return useQuery({
    queryKey: ['agents', selectedCompanyId],
    queryFn: () => fetchAgents(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000,
  });
}

export function useAgent(id: string) {
  return useQuery({
    queryKey: ['agent', id],
    queryFn: () => fetchAgent(id),
    enabled: !!id,
    staleTime: 2 * 60 * 1000,
  });
}
