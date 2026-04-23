import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type BrandConfig = {
  productName: string;
  productTagline: string;
  supportEmail: string;
  docsUrl: string;
  primaryColor: string;
  accentColor: string;
  faviconPath: string;
  logoPath: string;
  companyName: string;
  hideOpenSourceBranding: boolean;
};

export const DEFAULT_BRAND_CONFIG: BrandConfig = {
  productName: "Paperclip",
  productTagline: "AI-powered agent orchestration",
  supportEmail: "",
  docsUrl: "",
  primaryColor: "",
  accentColor: "",
  faviconPath: "",
  logoPath: "",
  companyName: "",
  hideOpenSourceBranding: false,
};

function candidateConfigPaths(): string[] {
  const fromEnv = process.env.WHITELABEL_CONFIG_PATH?.trim();
  // When an explicit path is set, honor it exclusively — this lets tests and
  // alt-deploys point at a non-existent path to disable config discovery.
  if (fromEnv) {
    return [path.isAbsolute(fromEnv) ? fromEnv : path.resolve(process.cwd(), fromEnv)];
  }

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const repoRootCandidates = [
    path.resolve(__dirname, "../../"),
    path.resolve(__dirname, "../../../"),
    process.cwd(),
  ];
  const names = ["whitelabel.config.ts", "whitelabel.config.js", "whitelabel.config.json"];

  const paths: string[] = [];
  for (const root of repoRootCandidates) {
    for (const name of names) paths.push(path.join(root, name));
  }
  return paths;
}

function parseStringLiteral(raw: string): string | undefined {
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith("`") && trimmed.endsWith("`"))
  ) {
    return trimmed.slice(1, -1);
  }
  return undefined;
}

function parseBooleanLiteral(raw: string): boolean | undefined {
  const trimmed = raw.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return undefined;
}

function extractField(source: string, key: keyof BrandConfig): string | undefined {
  // Match `key: <value>,` or `key: <value>\n` inside an object literal. Trailing
  // comma or closing brace terminates the value.
  const regex = new RegExp(`${key}\\s*:\\s*([^,\\n]+)`);
  const match = source.match(regex);
  if (!match) return undefined;
  return match[1].trim().replace(/,?\s*$/, "");
}

function parseTsConfig(source: string): Partial<BrandConfig> {
  const out: Partial<BrandConfig> = {};
  const stringKeys: (keyof BrandConfig)[] = [
    "productName",
    "productTagline",
    "supportEmail",
    "docsUrl",
    "primaryColor",
    "accentColor",
    "faviconPath",
    "logoPath",
    "companyName",
  ];
  for (const key of stringKeys) {
    const raw = extractField(source, key);
    if (raw === undefined) continue;
    const parsed = parseStringLiteral(raw);
    if (parsed !== undefined) (out as Record<string, unknown>)[key] = parsed;
  }
  const rawBool = extractField(source, "hideOpenSourceBranding");
  if (rawBool !== undefined) {
    const parsed = parseBooleanLiteral(rawBool);
    if (parsed !== undefined) out.hideOpenSourceBranding = parsed;
  }
  return out;
}

let cachedConfig: BrandConfig | null = null;

export function loadBrandConfig(force = false): BrandConfig {
  if (cachedConfig && !force) return cachedConfig;
  for (const candidate of candidateConfigPaths()) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const source = fs.readFileSync(candidate, "utf-8");
      let parsed: Partial<BrandConfig> = {};
      if (candidate.endsWith(".json")) {
        parsed = JSON.parse(source) as Partial<BrandConfig>;
      } else {
        parsed = parseTsConfig(source);
      }
      cachedConfig = { ...DEFAULT_BRAND_CONFIG, ...parsed };
      return cachedConfig;
    } catch {
      // fall through to next candidate
    }
  }
  cachedConfig = { ...DEFAULT_BRAND_CONFIG };
  return cachedConfig;
}

export function resetBrandConfigCache(): void {
  cachedConfig = null;
}
