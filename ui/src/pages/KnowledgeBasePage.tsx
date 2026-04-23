import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  FileText,
  Search,
  Upload,
  Plus,
  Download,
  Trash2,
  Loader2,
} from "lucide-react";
import { useCompany } from "../context/CompanyContext";
import {
  knowledgeApi,
  type GeneratedDocDto,
  type KnowledgeDocumentDto,
  type QueryResultDto,
} from "../api/knowledge";

const PRIMARY = "#2563eb";
const ACCENT = "#16a34a";

type TabKey = "knowledge" | "generator" | "generated";

const GENERATOR_CARDS: Array<{
  docType: "proposal" | "sop" | "faq" | "report";
  title: string;
  description: string;
  accent: string;
}> = [
  {
    docType: "proposal",
    title: "Proposal",
    description: "Pitch a new engagement using your company knowledge.",
    accent: PRIMARY,
  },
  {
    docType: "sop",
    title: "SOP",
    description: "Turn tribal knowledge into a standard operating procedure.",
    accent: ACCENT,
  },
  {
    docType: "faq",
    title: "FAQ",
    description: "Answer common questions for customers or new hires.",
    accent: "#9333ea",
  },
  {
    docType: "report",
    title: "Report",
    description: "Summarise findings with recommendations.",
    accent: "#ea580c",
  },
];

export function KnowledgeBasePage() {
  const { selectedCompanyId } = useCompany();
  const [tab, setTab] = useState<TabKey>("knowledge");

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <BookOpen className="h-7 w-7" style={{ color: PRIMARY }} />
        <div>
          <h1 className="text-2xl font-bold">Knowledge Base</h1>
          <p className="text-sm text-muted-foreground">
            Ingest company knowledge and generate polished documents with LlamaIndex.
          </p>
        </div>
      </header>

      <div className="flex gap-1 border-b">
        {(
          [
            { key: "knowledge", label: "Knowledge Base", icon: BookOpen },
            { key: "generator", label: "Doc Generator", icon: FileText },
            { key: "generated", label: "Generated Docs", icon: Download },
          ] as const
        ).map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? "border-[var(--tab-active)] text-[var(--tab-active)]"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            style={{ ["--tab-active" as string]: PRIMARY }}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {!selectedCompanyId ? (
        <div className="rounded border border-dashed p-8 text-center text-muted-foreground">
          Select a company to use the knowledge base.
        </div>
      ) : tab === "knowledge" ? (
        <KnowledgeTab companyId={selectedCompanyId} />
      ) : tab === "generator" ? (
        <GeneratorTab companyId={selectedCompanyId} onGenerated={() => setTab("generated")} />
      ) : (
        <GeneratedTab companyId={selectedCompanyId} />
      )}
    </div>
  );
}

function KnowledgeTab({ companyId }: { companyId: string }) {
  const [docs, setDocs] = useState<KnowledgeDocumentDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [docType, setDocType] = useState("general");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [queryResults, setQueryResults] = useState<QueryResultDto[] | null>(null);
  const [querying, setQuerying] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const result = await knowledgeApi.list(companyId);
      setDocs(result);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [companyId]);

  async function handleIngest(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      setError("Title and content are required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await knowledgeApi.ingest({ companyId, title, content, docType });
      setTitle("");
      setContent("");
      setDocType("general");
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ingest document");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this document?")) return;
    await knowledgeApi.delete(companyId, id);
    await reload();
  }

  async function handleQuery(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setQuerying(true);
    try {
      const res = await knowledgeApi.query({ companyId, query, topK: 5 });
      setQueryResults(res.results);
    } finally {
      setQuerying(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    file.text().then((text) => {
      setTitle((t) => t || file.name);
      setContent(text);
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Upload className="h-4 w-4" /> Ingest a document
        </h2>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          className="rounded border-2 border-dashed p-6 text-center text-sm text-muted-foreground"
        >
          Drag & drop a text file here, or paste content below.
        </div>

        <form onSubmit={handleIngest} className="flex flex-col gap-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Document title"
            className="rounded border px-3 py-2 text-sm"
          />
          <select
            value={docType}
            onChange={(e) => setDocType(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="general">General</option>
            <option value="policy">Policy</option>
            <option value="manual">Manual</option>
            <option value="notes">Notes</option>
          </select>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Paste document content..."
            rows={8}
            className="rounded border px-3 py-2 text-sm font-mono"
          />
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center justify-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            style={{ backgroundColor: PRIMARY }}
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Ingest document
          </button>
        </form>

        <form onSubmit={handleQuery} className="flex flex-col gap-3 pt-4 border-t">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Search className="h-4 w-4" /> Search
          </h3>
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ask a question about your knowledge base..."
              className="flex-1 rounded border px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={querying}
              className="rounded border px-4 py-2 text-sm font-semibold"
            >
              Search
            </button>
          </div>
          {queryResults ? (
            <div className="flex flex-col gap-2">
              {queryResults.length === 0 ? (
                <p className="text-sm text-muted-foreground">No matches found.</p>
              ) : (
                queryResults.map((r) => (
                  <div key={r.documentId} className="rounded border p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold">{r.title}</div>
                      <div className="text-xs text-muted-foreground">
                        score {r.score.toFixed(3)}
                      </div>
                    </div>
                    <p className="text-muted-foreground mt-1">{r.excerpt}</p>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </form>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Documents ({docs.length})</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading...
          </div>
        ) : docs.length === 0 ? (
          <div className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
            No documents yet. Ingest one on the left to get started.
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {docs.map((d) => (
              <li
                key={d.id}
                className="flex items-start justify-between gap-2 rounded border p-3 text-sm"
              >
                <div>
                  <div className="font-semibold">{d.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {d.docType} · {new Date(d.createdAt).toLocaleString()}
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="text-muted-foreground hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function GeneratorTab({
  companyId,
  onGenerated,
}: {
  companyId: string;
  onGenerated: () => void;
}) {
  const [open, setOpen] = useState<null | (typeof GENERATOR_CARDS)[number]>(null);
  const [generated, setGenerated] = useState<GeneratedDocDto | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GENERATOR_CARDS.map((card) => (
          <button
            key={card.docType}
            onClick={() => {
              setGenerated(null);
              setOpen(card);
            }}
            className="text-left rounded-lg border p-5 transition-all hover:shadow-md hover:-translate-y-0.5"
          >
            <div
              className="h-10 w-10 rounded flex items-center justify-center mb-3 text-white"
              style={{ backgroundColor: card.accent }}
            >
              <FileText className="h-5 w-5" />
            </div>
            <div className="font-semibold text-lg">{card.title}</div>
            <p className="text-sm text-muted-foreground mt-1">{card.description}</p>
            <span
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold"
              style={{ color: card.accent }}
            >
              <Plus className="h-4 w-4" /> Generate
            </span>
          </button>
        ))}
      </div>

      {open ? (
        <GenerateModal
          companyId={companyId}
          card={open}
          onClose={() => setOpen(null)}
          onComplete={(doc) => {
            setGenerated(doc);
            setOpen(null);
            onGenerated();
          }}
        />
      ) : null}

      {generated ? (
        <div className="rounded border p-4">
          <h3 className="font-semibold">{generated.title}</h3>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-sm">
            {generated.content}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function GenerateModal({
  companyId,
  card,
  onClose,
  onComplete,
}: {
  companyId: string;
  card: (typeof GENERATOR_CARDS)[number];
  onClose: () => void;
  onComplete: (doc: GeneratedDocDto) => void;
}) {
  const [title, setTitle] = useState(`New ${card.title}`);
  const [context, setContext] = useState("");
  const [audience, setAudience] = useState("");
  const [tone, setTone] = useState("professional and friendly");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<GeneratedDocDto | null>(null);

  async function handleGenerate() {
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const doc = await knowledgeApi.generate({
        companyId,
        docType: card.docType,
        title,
        context: { topic: context || undefined, audience, tone },
      });
      setPreview(doc);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate");
    } finally {
      setSubmitting(false);
    }
  }

  function handleCopy() {
    if (preview) navigator.clipboard?.writeText(preview.content);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="font-semibold text-lg">Generate {card.title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>
        <div className="p-4 flex flex-col gap-3">
          {preview ? (
            <>
              <div className="flex items-center justify-between">
                <h4 className="font-semibold">{preview.title}</h4>
                <button
                  onClick={handleCopy}
                  className="rounded border px-3 py-1 text-sm"
                >
                  Copy markdown
                </button>
              </div>
              <pre className="whitespace-pre-wrap font-mono text-sm border rounded p-3 bg-muted/30">
                {preview.content}
              </pre>
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded border px-4 py-2 text-sm">
                  Close
                </button>
                <button
                  onClick={() => onComplete(preview)}
                  className="rounded px-4 py-2 text-sm font-semibold text-white"
                  style={{ backgroundColor: card.accent }}
                >
                  Save to generated docs
                </button>
              </div>
            </>
          ) : (
            <>
              <label className="text-sm font-medium">Document title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              />
              <label className="text-sm font-medium">Topic / context</label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                placeholder={`What is this ${card.title.toLowerCase()} about?`}
                rows={4}
                className="rounded border px-3 py-2 text-sm"
              />
              <label className="text-sm font-medium">Audience</label>
              <input
                type="text"
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
                placeholder="e.g. potential customers, new hires"
                className="rounded border px-3 py-2 text-sm"
              />
              <label className="text-sm font-medium">Tone</label>
              <input
                type="text"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="rounded border px-3 py-2 text-sm"
              />
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="rounded border px-4 py-2 text-sm">
                  Cancel
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ backgroundColor: card.accent }}
                >
                  {submitting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  Generate Document
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GeneratedTab({ companyId }: { companyId: string }) {
  const [docs, setDocs] = useState<GeneratedDocDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    knowledgeApi
      .listGenerated(companyId)
      .then((rows) => {
        if (active) setDocs(rows);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [companyId]);

  const expanded = useMemo(
    () => docs.find((d) => d.id === expandedId) ?? null,
    [docs, expandedId],
  );

  function handleExport(doc: GeneratedDocDto) {
    const blob = new Blob([doc.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${doc.title.replace(/[^\w.-]+/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
      </div>
    );
  }

  if (docs.length === 0) {
    return (
      <div className="rounded border border-dashed p-8 text-center text-sm text-muted-foreground">
        No generated documents yet. Head to the Doc Generator tab to create one.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {docs.map((d) => (
        <li key={d.id} className="rounded border">
          <div className="flex items-center justify-between p-3">
            <button
              onClick={() => setExpandedId((cur) => (cur === d.id ? null : d.id))}
              className="text-left flex-1"
            >
              <div className="font-semibold">{d.title}</div>
              <div className="text-xs text-muted-foreground">
                {d.docType} · {new Date(d.createdAt).toLocaleString()}
              </div>
            </button>
            <button
              onClick={() => handleExport(d)}
              className="inline-flex items-center gap-1 rounded border px-3 py-1 text-sm"
            >
              <Download className="h-4 w-4" /> Export
            </button>
          </div>
          {expanded?.id === d.id ? (
            <pre className="whitespace-pre-wrap font-mono text-sm border-t p-3 bg-muted/30">
              {d.content}
            </pre>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
