export const type = "ollama_local";
export const label = "Ollama (local)";
export const DEFAULT_OLLAMA_LOCAL_BASE_URL = "http://127.0.0.1:11434";
export const DEFAULT_OLLAMA_LOCAL_MODEL = "llama3.1:8b";

export const models = [
  { id: DEFAULT_OLLAMA_LOCAL_MODEL, label: DEFAULT_OLLAMA_LOCAL_MODEL },
  { id: "llama3.2:3b", label: "llama3.2:3b" },
  { id: "qwen2.5-coder:7b", label: "qwen2.5-coder:7b" },
  { id: "qwen3-coder:30b", label: "qwen3-coder:30b" },
  { id: "qwen3-vl:30b", label: "qwen3-vl:30b" },
];

export const agentConfigurationDoc = `# ollama_local agent configuration

Adapter: ollama_local

Use when:
- You want Paperclip to use locally hosted Ollama models with no Claude or Codex quota impact
- The task is text-only triage, summarization, classification, first-pass drafting, outline generation, scoring, or internal status synthesis
- You want cheap local work before escalating to Codex or Claude

Don't use when:
- The task needs browser automation, filesystem editing, shell commands, API publishing, or external platform actions
- The task is final legal, reputational, board-facing, or brand-critical copy without human or stronger-model review
- Ollama is not running on the machine that runs Paperclip

Core fields:
- baseUrl (string, optional): Ollama server URL. Defaults to http://127.0.0.1:11434
- model (string, optional): Ollama model tag. Defaults to llama3.1:8b
- instructionsFilePath (string, optional): absolute path to a markdown instructions file prepended to the system prompt
- promptTemplate (string, optional): run prompt template
- temperature (number, optional): generation temperature
- numCtx (number, optional): Ollama num_ctx option
- timeoutSec (number, optional): request timeout in seconds. Defaults to 900

Notes:
- Runs call Ollama's /api/chat endpoint with stream=false.
- This adapter is intentionally tool-free. It should produce text and structured handoff notes, not mutate files or publish externally.
- Use Codex for Substack/Reddit publishing, API operations, browser work, and technical implementation.
`;
