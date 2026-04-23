import { api } from "./client";

export interface KnowledgeDocumentDto {
  id: string;
  companyId: string;
  title: string;
  content: string;
  source: string | null;
  docType: string;
  createdAt: string;
}

export interface GeneratedDocDto {
  id: string;
  companyId: string;
  title: string;
  content: string;
  docType: string;
  createdAt: string;
}

export interface QueryResultDto {
  documentId: string;
  title: string;
  score: number;
  excerpt: string;
}

export interface IngestInput {
  companyId: string;
  title: string;
  content: string;
  source?: string;
  docType?: string;
}

export interface GenerateInput {
  companyId: string;
  docType: string;
  title: string;
  context: {
    topic?: string;
    audience?: string;
    tone?: string;
    extras?: string;
  };
}

export interface QueryInput {
  companyId: string;
  query: string;
  topK?: number;
}

export const knowledgeApi = {
  list: (companyId: string) =>
    api.get<KnowledgeDocumentDto[]>(
      `/knowledge/documents?companyId=${encodeURIComponent(companyId)}`,
    ),
  ingest: (body: IngestInput) => api.post<KnowledgeDocumentDto>("/knowledge/ingest", body),
  query: (body: QueryInput) =>
    api.post<{ results: QueryResultDto[] }>("/knowledge/query", body),
  generate: (body: GenerateInput) => api.post<GeneratedDocDto>("/knowledge/generate", body),
  listGenerated: (companyId: string) =>
    api.get<GeneratedDocDto[]>(
      `/knowledge/generated?companyId=${encodeURIComponent(companyId)}`,
    ),
  delete: (companyId: string, id: string) =>
    api.delete<void>(
      `/knowledge/documents/${encodeURIComponent(id)}?companyId=${encodeURIComponent(companyId)}`,
    ),
};
