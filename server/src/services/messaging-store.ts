import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

export type MessageChannel = "sms" | "whatsapp";

export interface ThreadMessage {
  id: string;
  direction: "inbound" | "outbound";
  body: string;
  twilioSid?: string;
  sentAt: string;
}

export interface MessageThread {
  id: string;
  companyId: string;
  channel: MessageChannel;
  externalPhone: string; // E.164 format, e.g. "+14155552671"
  contactName?: string;
  messages: ThreadMessage[];
  createdAt: string;
  updatedAt: string;
}

type Store = Record<string, MessageThread>; // keyed by thread id

function storeFilePath(): string {
  return path.resolve(
    resolvePaperclipInstanceRoot(),
    "data",
    "messaging-threads.json",
  );
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

/**
 * Find an existing thread for (companyId, channel, externalPhone) or create one.
 */
export async function findOrCreateThread(
  companyId: string,
  channel: MessageChannel,
  externalPhone: string,
): Promise<MessageThread> {
  const store = await readStore();

  const existing = Object.values(store).find(
    (t) =>
      t.companyId === companyId &&
      t.channel === channel &&
      t.externalPhone === externalPhone,
  );
  if (existing) return existing;

  const now = new Date().toISOString();
  const thread: MessageThread = {
    id: randomUUID(),
    companyId,
    channel,
    externalPhone,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  store[thread.id] = thread;
  await writeStore(store);
  return thread;
}

/**
 * Append a message to a thread. Throws if the thread does not exist.
 */
export async function appendMessage(
  threadId: string,
  msg: Omit<ThreadMessage, "id">,
): Promise<ThreadMessage> {
  const store = await readStore();
  const thread = store[threadId];
  if (!thread) throw new Error(`Messaging thread not found: ${threadId}`);

  const message: ThreadMessage = { id: randomUUID(), ...msg };
  thread.messages.push(message);
  thread.updatedAt = new Date().toISOString();

  await writeStore(store);
  return message;
}

/**
 * List all threads for a company, ordered by most recently updated first.
 */
export async function listThreads(companyId: string): Promise<MessageThread[]> {
  const store = await readStore();
  return Object.values(store)
    .filter((t) => t.companyId === companyId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Get a single thread by id, or null if not found.
 */
export async function getThread(threadId: string): Promise<MessageThread | null> {
  const store = await readStore();
  return store[threadId] ?? null;
}
