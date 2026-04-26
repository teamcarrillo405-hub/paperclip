import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type OIDCProvider = {
  id: string;
  name: string;
  clientId: string;
  clientSecret: string;
  discoveryUrl: string;
  scopes: string[];
  enabled: boolean;
  emailClaim: string;
  nameClaim: string;
  groupsClaim?: string;
  adminGroupName?: string;
};

export type SSOConfig = {
  providers: OIDCProvider[];
  enforceSSO: boolean;
  allowedDomains?: string[];
};

function storeFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "sso-config.json");
}

const defaultConfig: SSOConfig = {
  providers: [],
  enforceSSO: false,
};

async function readConfig(): Promise<SSOConfig> {
  try {
    const raw = await fs.readFile(storeFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as SSOConfig;
    return parsed && typeof parsed === "object" ? parsed : defaultConfig;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { ...defaultConfig };
    throw err;
  }
}

async function writeConfig(config: SSOConfig): Promise<void> {
  const file = storeFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(config, null, 2), "utf-8");
}

export async function getSSOConfig(): Promise<SSOConfig> {
  return readConfig();
}

export async function saveSSOConfig(config: SSOConfig): Promise<void> {
  await writeConfig(config);
}

export async function getProviderById(id: string): Promise<OIDCProvider | null> {
  const config = await readConfig();
  return config.providers.find((p) => p.id === id) ?? null;
}
