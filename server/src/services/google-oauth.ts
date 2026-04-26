// Required environment variables:
// GOOGLE_CLIENT_ID=
// GOOGLE_CLIENT_SECRET=
// GOOGLE_REDIRECT_URI=http://localhost:3100/api/google/auth/callback

import { promises as fs } from "node:fs";
import path from "node:path";
import { google, Auth } from "googleapis";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

type OAuth2Client = Auth.OAuth2Client;

export type GoogleTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  scope: string;
};

type Store = Record<string, GoogleTokens>;

function storeFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "google-oauth.json");
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

export async function getGoogleTokens(companyId: string): Promise<GoogleTokens | null> {
  const store = await readStore();
  return store[companyId] ?? null;
}

export async function storeGoogleTokens(companyId: string, tokens: GoogleTokens): Promise<void> {
  const store = await readStore();
  store[companyId] = tokens;
  await writeStore(store);
}

export async function deleteGoogleTokens(companyId: string): Promise<void> {
  const store = await readStore();
  delete store[companyId];
  await writeStore(store);
}

export function createGoogleOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth is not configured: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI must be set",
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export async function getAuthorizedGoogleClient(companyId: string): Promise<OAuth2Client> {
  const tokens = await getGoogleTokens(companyId);
  if (!tokens) {
    throw new Error(`Google Workspace is not connected for company ${companyId}`);
  }

  const client = createGoogleOAuth2Client();
  client.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.expiresAt,
  });

  return client;
}
