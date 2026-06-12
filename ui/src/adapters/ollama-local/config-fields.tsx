import type { AdapterConfigFieldsProps } from "../types";
import {
  DraftInput,
  DraftNumberInput,
  Field,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { DEFAULT_OLLAMA_LOCAL_BASE_URL } from "@paperclipai/adapter-ollama-local";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Prepended to the Ollama system prompt at runtime.";

function readCreateSchemaValue(
  values: AdapterConfigFieldsProps["values"],
  key: string,
  fallback: unknown,
): unknown {
  return values?.adapterSchemaValues?.[key] ?? fallback;
}

export function OllamaLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const createSchema = values?.adapterSchemaValues ?? {};
  return (
    <>
      {!hideInstructionsFile && (
        <Field label="Agent instructions file" hint={instructionsFileHint}>
          <div className="flex items-center gap-2">
            <DraftInput
              value={
                isCreate
                  ? values!.instructionsFilePath ?? ""
                  : eff(
                      "adapterConfig",
                      "instructionsFilePath",
                      String(config.instructionsFilePath ?? ""),
                    )
              }
              onCommit={(v) =>
                isCreate
                  ? set!({ instructionsFilePath: v })
                  : mark("adapterConfig", "instructionsFilePath", v || undefined)
              }
              immediate
              className={inputClass}
              placeholder="/absolute/path/to/AGENTS.md"
            />
            <ChoosePathButton />
          </div>
        </Field>
      )}

      <Field label="Ollama base URL" hint="Local Ollama server URL. Keep this on loopback unless you intentionally expose Ollama.">
        <DraftInput
          value={
            isCreate
              ? String(readCreateSchemaValue(values, "baseUrl", DEFAULT_OLLAMA_LOCAL_BASE_URL))
              : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? DEFAULT_OLLAMA_LOCAL_BASE_URL))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ adapterSchemaValues: { ...createSchema, baseUrl: v || DEFAULT_OLLAMA_LOCAL_BASE_URL } })
              : mark("adapterConfig", "baseUrl", v || DEFAULT_OLLAMA_LOCAL_BASE_URL)
          }
          immediate
          className={inputClass}
          placeholder={DEFAULT_OLLAMA_LOCAL_BASE_URL}
        />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Temperature" hint="Optional generation temperature. Lower values are more consistent.">
          <DraftNumberInput
            value={
              isCreate
                ? Number(readCreateSchemaValue(values, "temperature", 0.2))
                : eff("adapterConfig", "temperature", Number(config.temperature ?? 0.2))
            }
            onCommit={(v) =>
              isCreate
                ? set!({ adapterSchemaValues: { ...createSchema, temperature: v } })
                : mark("adapterConfig", "temperature", v)
            }
            immediate
            step={0.1}
            min={0}
            max={2}
            className={inputClass}
          />
        </Field>
        <Field label="Context tokens" hint="Optional Ollama num_ctx setting. Leave modest for cheaper, faster local runs.">
          <DraftNumberInput
            value={
              isCreate
                ? Number(readCreateSchemaValue(values, "numCtx", 8192))
                : eff("adapterConfig", "numCtx", Number(config.numCtx ?? 8192))
            }
            onCommit={(v) =>
              isCreate
                ? set!({ adapterSchemaValues: { ...createSchema, numCtx: v } })
                : mark("adapterConfig", "numCtx", v)
            }
            immediate
            min={1024}
            step={1024}
            className={inputClass}
          />
        </Field>
      </div>
    </>
  );
}
