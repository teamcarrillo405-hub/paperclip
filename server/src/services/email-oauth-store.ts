import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type EmailProviderKey = "gmail" | "outlook";

export interface EmailOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  provider: EmailProviderKey;
  emailAddress: string;
}

type Store = Record<string, Record<string, EmailOAuthTokens>>;

function storeFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "email-oauth.json");
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(storeFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as Store;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw err;
  }
}

async function writeStore(store: Store): Promise<void> {
  const file = storeFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf-8");
}

function key(companyId: string, provider: EmailProviderKey): string {
  return `${companyId}:${provider}`;
}

export const emailOAuthStore = {
  async get(companyId: string, provider: EmailProviderKey): Promise<EmailOAuthTokens | null> {
    const store = await readStore();
    return store[companyId]?.[provider] ?? null;
  },

  async set(companyId: string, tokens: EmailOAuthTokens): Promise<void> {
    const store = await readStore();
    if (!store[companyId]) store[companyId] = {};
    store[companyId]![tokens.provider] = tokens;
    await writeStore(store);
  },

  async delete(companyId: string, provider: EmailProviderKey): Promise<void> {
    const store = await readStore();
    if (store[companyId]) {
      delete store[companyId]![provider];
      if (Object.keys(store[companyId]!).length === 0) delete store[companyId];
    }
    await writeStore(store);
  },

  async listForCompany(
    companyId: string,
  ): Promise<Partial<Record<EmailProviderKey, EmailOAuthTokens>>> {
    const store = await readStore();
    return store[companyId] ?? {};
  },

  key,
};
