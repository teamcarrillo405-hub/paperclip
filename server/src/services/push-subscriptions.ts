// run: pnpm add web-push && pnpm add -D @types/web-push
import webpush from "web-push";
import { promises as fs } from "node:fs";
import path from "node:path";
import { resolvePaperclipInstanceRoot } from "../home-paths.js";

// ---------------------------------------------------------------------------
// VAPID configuration
// ---------------------------------------------------------------------------
// Generate keys once with:
//   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k))"
// Then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_CONTACT_EMAIL in .env
// ---------------------------------------------------------------------------

const VAPID_PUBLIC_KEY = process.env["VAPID_PUBLIC_KEY"];
const VAPID_PRIVATE_KEY = process.env["VAPID_PRIVATE_KEY"];
const VAPID_CONTACT_EMAIL = process.env["VAPID_CONTACT_EMAIL"] ?? "noreply@averoai.com";

let vapidConfigured = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    `mailto:${VAPID_CONTACT_EMAIL}`,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  vapidConfigured = true;
}

// ---------------------------------------------------------------------------
// Store shape:  Record<companyId, PushSubscription[]>
// PushSubscription is the standard Web Push subscription JSON object
// ---------------------------------------------------------------------------

// We use the standard W3C PushSubscription JSON serialization shape
interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface StoredPushSubscription {
  endpoint: string;
  expirationTime: number | null;
  keys: PushSubscriptionKeys;
}

type Store = Record<string, StoredPushSubscription[]>;

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function storeFilePath(): string {
  return path.resolve(resolvePaperclipInstanceRoot(), "data", "push-subscriptions.json");
}

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(storeFilePath(), "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Store)
      : {};
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function addSubscription(
  companyId: string,
  sub: StoredPushSubscription,
): Promise<void> {
  const store = await readStore();
  const subs = store[companyId] ?? [];

  // De-duplicate by endpoint — replace if already present
  const filtered = subs.filter((s) => s.endpoint !== sub.endpoint);
  store[companyId] = [...filtered, sub];

  await writeStore(store);
}

export async function removeSubscription(
  companyId: string,
  endpoint: string,
): Promise<void> {
  const store = await readStore();
  if (!store[companyId]) return;

  store[companyId] = store[companyId]!.filter((s) => s.endpoint !== endpoint);
  if (store[companyId]!.length === 0) delete store[companyId];

  await writeStore(store);
}

export async function getSubscriptions(
  companyId: string,
): Promise<StoredPushSubscription[]> {
  const store = await readStore();
  return store[companyId] ?? [];
}

export interface PushPayload {
  title?: string;
  body: string;
}

export async function sendPushToCompany(
  companyId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number }> {
  if (!vapidConfigured) {
    throw new Error(
      "VAPID keys are not configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and VAPID_CONTACT_EMAIL in your environment.",
    );
  }

  const subs = await getSubscriptions(companyId);
  if (subs.length === 0) return { sent: 0, failed: 0 };

  const message = JSON.stringify(payload);

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          expirationTime: sub.expirationTime ?? undefined,
          keys: sub.keys,
        },
        message,
      ),
    ),
  );

  // Remove expired/invalid subscriptions (410 Gone, 404 Not Found)
  const expiredEndpoints: string[] = [];
  results.forEach((result, idx) => {
    if (
      result.status === "rejected" &&
      result.reason instanceof webpush.WebPushError &&
      (result.reason.statusCode === 410 || result.reason.statusCode === 404)
    ) {
      expiredEndpoints.push(subs[idx]!.endpoint);
    }
  });

  if (expiredEndpoints.length > 0) {
    const store = await readStore();
    if (store[companyId]) {
      store[companyId] = store[companyId]!.filter(
        (s) => !expiredEndpoints.includes(s.endpoint),
      );
      if (store[companyId]!.length === 0) delete store[companyId];
      await writeStore(store);
    }
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.length - sent;

  return { sent, failed };
}
