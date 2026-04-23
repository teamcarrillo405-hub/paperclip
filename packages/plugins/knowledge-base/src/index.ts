import type { AgentTool, AgentToolContext } from "./types.js";
import { KnowledgeService, inMemoryKnowledgeStore, type KnowledgeStore } from "./knowledge-service.js";

export * from "./types.js";
export {
  KnowledgeService,
  inMemoryKnowledgeStore,
  type KnowledgeStore,
} from "./knowledge-service.js";

function requireCompanyId(ctx?: AgentToolContext): string {
  const id = ctx?.companyId;
  if (!id) throw new Error("companyId is required for the knowledge base tool");
  return id;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${field} is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

async function fetchUrlContent(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  const text = await res.text();
  // Very light HTML strip so we capture the readable text.
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function createKnowledgeBaseToolkit(
  store: KnowledgeStore = inMemoryKnowledgeStore,
): AgentTool[] {
  const service = new KnowledgeService(store);

  const ingestDocument: AgentTool = {
    name: "ingest_document",
    description:
      "Ingest raw text content into the company knowledge base so it can be queried later.",
    parametersSchema: {
      type: "object",
      required: ["title", "content"],
      properties: {
        title: { type: "string", description: "Title of the document" },
        content: { type: "string", description: "Full text content of the document" },
        source: { type: "string", description: "Optional source URL or filename" },
        docType: {
          type: "string",
          description: "Document category: general, policy, manual, etc.",
        },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(ctx);
      const title = asString((args as { title?: unknown }).title, "title");
      const content = asString((args as { content?: unknown }).content, "content");
      const source = optionalString((args as { source?: unknown }).source);
      const docType = optionalString((args as { docType?: unknown }).docType) ?? "general";
      return service.ingestDocument(companyId, title, content, source, docType);
    },
  };

  const ingestUrl: AgentTool = {
    name: "ingest_url",
    description: "Fetch a URL and ingest its readable text into the knowledge base.",
    parametersSchema: {
      type: "object",
      required: ["url"],
      properties: {
        url: { type: "string", description: "HTTP/HTTPS URL to fetch" },
        title: { type: "string", description: "Optional title (defaults to URL)" },
        docType: { type: "string", description: "Optional document category" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(ctx);
      const url = asString((args as { url?: unknown }).url, "url");
      const content = await fetchUrlContent(url);
      const title = optionalString((args as { title?: unknown }).title) ?? url;
      const docType = optionalString((args as { docType?: unknown }).docType) ?? "general";
      return service.ingestDocument(companyId, title, content, url, docType);
    },
  };

  const queryKnowledge: AgentTool = {
    name: "query_knowledge",
    description: "Run a similarity search over the company knowledge base and return top matches.",
    parametersSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string", description: "Natural-language query" },
        topK: { type: "number", description: "Number of results to return (default 5)" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(ctx);
      const query = asString((args as { query?: unknown }).query, "query");
      const topK = optionalNumber((args as { topK?: unknown }).topK) ?? 5;
      return service.queryKnowledge(companyId, query, topK);
    },
  };

  function makeGenerator(
    toolName: string,
    docType: string,
    description: string,
  ): AgentTool {
    return {
      name: toolName,
      description,
      parametersSchema: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string", description: "Document title" },
          topic: { type: "string", description: "Primary topic or subject" },
          audience: { type: "string", description: "Target audience" },
          tone: { type: "string", description: "Desired tone (professional, casual, etc.)" },
          extras: { type: "string", description: "Free-form extra context" },
        },
      },
      async execute(args, ctx) {
        const companyId = requireCompanyId(ctx);
        const a = args as Record<string, unknown>;
        const title = asString(a.title, "title");
        return service.generateDocument(companyId, docType, title, {
          topic: optionalString(a.topic) ?? undefined,
          audience: optionalString(a.audience) ?? undefined,
          tone: optionalString(a.tone) ?? undefined,
          extras: optionalString(a.extras) ?? undefined,
        });
      },
    };
  }

  const generateProposal = makeGenerator(
    "generate_proposal",
    "proposal",
    "Generate a business proposal document from the knowledge base.",
  );
  const generateSop = makeGenerator(
    "generate_sop",
    "sop",
    "Generate a standard operating procedure (SOP) from the knowledge base.",
  );
  const generateFaq = makeGenerator(
    "generate_faq",
    "faq",
    "Generate an FAQ document from the knowledge base.",
  );
  const generateReport = makeGenerator(
    "generate_report",
    "report",
    "Generate a business report from the knowledge base.",
  );

  const listDocuments: AgentTool = {
    name: "list_documents",
    description: "List all ingested documents in the company knowledge base.",
    parametersSchema: { type: "object", properties: {} },
    async execute(_args, ctx) {
      const companyId = requireCompanyId(ctx);
      return service.listDocuments(companyId);
    },
  };

  const deleteDocument: AgentTool = {
    name: "delete_document",
    description: "Remove a document from the knowledge base by id.",
    parametersSchema: {
      type: "object",
      required: ["documentId"],
      properties: {
        documentId: { type: "string", description: "Id of the document to delete" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(ctx);
      const documentId = asString((args as { documentId?: unknown }).documentId, "documentId");
      const removed = await service.deleteDocument(companyId, documentId);
      return { removed };
    },
  };

  const exportDocument: AgentTool = {
    name: "export_document",
    description: "Export a previously generated document as a markdown string.",
    parametersSchema: {
      type: "object",
      required: ["documentId"],
      properties: {
        documentId: { type: "string", description: "Id of the generated document" },
      },
    },
    async execute(args, ctx) {
      const companyId = requireCompanyId(ctx);
      const documentId = asString((args as { documentId?: unknown }).documentId, "documentId");
      const doc = await service.getGeneratedDocument(companyId, documentId);
      if (!doc) throw new Error(`Generated document ${documentId} not found`);
      return {
        id: doc.id,
        title: doc.title,
        docType: doc.docType,
        markdown: doc.content,
        createdAt: doc.createdAt,
      };
    },
  };

  return [
    ingestDocument,
    ingestUrl,
    queryKnowledge,
    generateProposal,
    generateSop,
    generateFaq,
    generateReport,
    listDocuments,
    deleteDocument,
    exportDocument,
  ];
}

export const knowledgeBaseTools: AgentTool[] = createKnowledgeBaseToolkit();
