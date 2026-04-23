export interface KnowledgeDocument {
  id: string;
  companyId: string;
  title: string;
  content: string;
  source: string | null;
  docType: string;
  embedding?: number[];
  createdAt: string;
}

export interface QueryResult {
  documentId: string;
  title: string;
  score: number;
  excerpt: string;
}

export interface GeneratedDoc {
  id: string;
  companyId: string;
  title: string;
  content: string;
  docType: string;
  createdAt: string;
}

export interface AgentToolContext {
  companyId?: string;
  userId?: string;
}

export interface AgentTool<TArgs = Record<string, unknown>, TResult = unknown> {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  execute: (args: TArgs, ctx?: AgentToolContext) => Promise<TResult>;
}

export type KnowledgeDocType = "general" | "proposal" | "sop" | "faq" | "report";
