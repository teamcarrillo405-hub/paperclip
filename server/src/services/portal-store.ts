import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";
import { conflict } from "../errors.js";

export interface PortalUser {
  id: string;
  companyId: string;
  email: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt?: string;
}

export interface PortalSession {
  token: string;
  userId: string;
  companyId: string;
  expiresAt: string;
  createdAt: string;
}

interface PortalStore {
  users: PortalUser[];
  sessions: PortalSession[];
}

function storeFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "portal.json");
}

async function readStore(): Promise<PortalStore> {
  try {
    const raw = await fs.readFile(storeFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as PortalStore;
    if (parsed && typeof parsed === "object") return parsed;
    return { users: [], sessions: [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return { users: [], sessions: [] };
    }
    throw err;
  }
}

async function writeStore(store: PortalStore): Promise<void> {
  const file = storeFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(store, null, 2), "utf-8");
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(hash));
}

export async function createPortalUser(
  companyId: string,
  email: string,
  name: string,
  password: string,
): Promise<PortalUser> {
  const store = await readStore();
  const existing = store.users.find(
    (u) => u.email.toLowerCase() === email.toLowerCase(),
  );
  if (existing) throw conflict("A portal user with that email already exists");

  const user: PortalUser = {
    id: randomUUID(),
    companyId,
    email: email.toLowerCase().trim(),
    name: name.trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };

  store.users.push(user);
  await writeStore(store);
  return user;
}

export async function getPortalUserByEmail(email: string): Promise<PortalUser | null> {
  const store = await readStore();
  return (
    store.users.find((u) => u.email.toLowerCase() === email.toLowerCase()) ?? null
  );
}

export async function getPortalUserById(id: string): Promise<PortalUser | null> {
  const store = await readStore();
  return store.users.find((u) => u.id === id) ?? null;
}

export async function verifyPortalUserPassword(
  email: string,
  password: string,
): Promise<PortalUser | null> {
  const user = await getPortalUserByEmail(email);
  if (!user) return null;
  if (!verifyPassword(password, user.passwordHash)) return null;

  // Update lastLoginAt
  const store = await readStore();
  const idx = store.users.findIndex((u) => u.id === user.id);
  if (idx !== -1) {
    store.users[idx]!.lastLoginAt = new Date().toISOString();
    await writeStore(store);
    return store.users[idx]!;
  }
  return user;
}

export async function createPortalSession(
  userId: string,
  companyId: string,
): Promise<PortalSession> {
  const store = await readStore();

  // Prune expired sessions first
  const now = Date.now();
  store.sessions = store.sessions.filter(
    (s) => new Date(s.expiresAt).getTime() > now,
  );

  const session: PortalSession = {
    token: crypto.randomBytes(32).toString("hex"),
    userId,
    companyId,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
  };

  store.sessions.push(session);
  await writeStore(store);
  return session;
}

export async function validatePortalSession(
  token: string,
): Promise<{ user: PortalUser; companyId: string } | null> {
  const store = await readStore();
  const now = Date.now();

  const session = store.sessions.find((s) => s.token === token);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() <= now) {
    // Prune expired and persist
    store.sessions = store.sessions.filter(
      (s) => new Date(s.expiresAt).getTime() > now,
    );
    await writeStore(store);
    return null;
  }

  const user = store.users.find((u) => u.id === session.userId) ?? null;
  if (!user) return null;

  return { user, companyId: session.companyId };
}

export async function deletePortalSession(token: string): Promise<void> {
  const store = await readStore();
  store.sessions = store.sessions.filter((s) => s.token !== token);
  await writeStore(store);
}

export async function listPortalUsers(companyId: string): Promise<PortalUser[]> {
  const store = await readStore();
  return store.users.filter((u) => u.companyId === companyId);
}

export async function deletePortalUser(id: string): Promise<void> {
  const store = await readStore();
  store.users = store.users.filter((u) => u.id !== id);
  // Also delete their sessions
  store.sessions = store.sessions.filter((s) => s.userId !== id);
  await writeStore(store);
}
