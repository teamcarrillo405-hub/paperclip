import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchIssues,
  fetchIssue,
  createIssue,
  updateIssueStatus,
  addComment,
} from '../api/issues';
import type { CreateIssuePayload, IssueStatus, AddCommentPayload } from '../api/issues';
import { useCompany } from '../context/CompanyContext';

export function useIssues() {
  const { selectedCompanyId } = useCompany();

  return useQuery({
    queryKey: ['issues', selectedCompanyId],
    queryFn: () => fetchIssues(selectedCompanyId!),
    enabled: !!selectedCompanyId,
    staleTime: 60 * 1000, // 1 minute
    refetchOnWindowFocus: true,
  });
}

export function useIssue(id: string) {
  return useQuery({
    queryKey: ['issue', id],
    queryFn: () => fetchIssue(id),
    enabled: !!id,
    staleTime: 30 * 1000,
  });
}

export function useCreateIssue() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();

  return useMutation({
    mutationFn: (payload: CreateIssuePayload) => createIssue(payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['issues', selectedCompanyId] });
    },
  });
}

export function useUpdateIssueStatus() {
  const qc = useQueryClient();
  const { selectedCompanyId } = useCompany();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: IssueStatus }) =>
      updateIssueStatus(id, status),
    onSuccess: (updated) => {
      qc.setQueryData(['issue', updated.id], updated);
      void qc.invalidateQueries({ queryKey: ['issues', selectedCompanyId] });
    },
  });
}

export function useAddComment(issueId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: AddCommentPayload) => addComment(issueId, payload),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['issue', issueId] });
    },
  });
}
