import { promises as fs } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type SCIMToken = {
  token: string;
  createdAt: string;
  description?: string;
};

function storeFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "scim-token.json");
}

async function readToken(): Promise<SCIMToken | null> {
  try {
    const raw = await fs.readFile(storeFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as SCIMToken;
    return parsed && typeof parsed === "object" && parsed.token ? parsed : null;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeToken(token: SCIMToken): Promise<void> {
  const file = storeFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(token, null, 2), "utf-8");
}

export function getSCIMToken(): Promise<SCIMToken | null> {
  return readToken();
}

export async function generateSCIMToken(description?: string): Promise<SCIMToken> {
  const token: SCIMToken = {
    token: randomBytes(32).toString("hex"),
    createdAt: new Date().toISOString(),
    ...(description ? { description } : {}),
  };
  await writeToken(token);
  return token;
}

export async function deleteSCIMToken(): Promise<void> {
  try {
    await fs.unlink(storeFilePath());
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}

export async function validateSCIMToken(bearer: string): Promise<boolean> {
  const stored = await readToken();
  if (!stored) return false;
  return stored.token === bearer;
}
