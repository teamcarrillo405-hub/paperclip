import { apiGet, apiPost, apiPatch } from './client';

export type IssueStatus = 'open' | 'in-progress' | 'done';

export type IssueActivity = {
  id: string;
  issueId: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
};

export type Issue = {
  id: string;
  companyId: string;
  title: string;
  description?: string;
  status: IssueStatus;
  assignedAgentId?: string;
  assignedAgentName?: string;
  createdAt: string;
  updatedAt: string;
  activity?: IssueActivity[];
};

export type CreateIssuePayload = {
  companyId: string;
  title: string;
  description?: string;
  assignedAgentId?: string;
};

export type AddCommentPayload = {
  content: string;
};

export async function fetchIssues(companyId: string): Promise<Issue[]> {
  return apiGet<Issue[]>('/issues', { companyId });
}

export async function fetchIssue(id: string): Promise<Issue> {
  return apiGet<Issue>(`/issues/${id}`);
}

export async function createIssue(payload: CreateIssuePayload): Promise<Issue> {
  return apiPost<CreateIssuePayload, Issue>('/issues', payload);
}

export async function updateIssueStatus(
  id: string,
  status: IssueStatus,
): Promise<Issue> {
  return apiPatch<{ status: IssueStatus }, Issue>(`/issues/${id}`, { status });
}

export async function addComment(
  issueId: string,
  payload: AddCommentPayload,
): Promise<IssueActivity> {
  return apiPost<AddCommentPayload, IssueActivity>(
    `/issues/${issueId}/comments`,
    payload,
  );
}
