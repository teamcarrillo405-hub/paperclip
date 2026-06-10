import { createHmac, timingSafeEqual } from "node:crypto";

export type SignedReviewKind = "approval" | "hcc_queue";

export type SignedReviewTokenPayload = {
  v: 1;
  scope: "review";
  kind: SignedReviewKind;
  id: string;
  exp: number;
};

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function signingSecret() {
  const secret = process.env.PAPERCLIP_SIGNED_REVIEW_SECRET
    ?? process.env.BETTER_AUTH_SECRET
    ?? process.env.PAPERCLIP_AGENT_JWT_SECRET;
  if (!secret) {
    throw new Error("PAPERCLIP_SIGNED_REVIEW_SECRET, BETTER_AUTH_SECRET, or PAPERCLIP_AGENT_JWT_SECRET must be set");
  }
  return secret;
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(unsigned: string) {
  return createHmac("sha256", signingSecret()).update(unsigned).digest("base64url");
}

function parsePositiveTtlMs(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) return DEFAULT_TTL_MS;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TTL_MS;
  return Math.min(parsed, MAX_TTL_MS);
}

export function createSignedReviewToken(input: {
  kind: SignedReviewKind;
  id: string;
  ttlMs?: number;
  now?: Date;
}) {
  const nowMs = input.now?.getTime() ?? Date.now();
  const ttlMs = Math.min(input.ttlMs ?? DEFAULT_TTL_MS, MAX_TTL_MS);
  const payload: SignedReviewTokenPayload = {
    v: 1,
    scope: "review",
    kind: input.kind,
    id: input.id,
    exp: nowMs + ttlMs,
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload)}`;
}

export function createSignedReviewUrl(input: {
  origin: string;
  kind: SignedReviewKind;
  id: string;
  ttlMs?: number;
  now?: Date;
}) {
  const token = createSignedReviewToken(input);
  const path = input.kind === "approval"
    ? `/review/approval/${encodeURIComponent(input.id)}`
    : `/review/${encodeURIComponent(input.id)}`;
  const url = new URL(path, input.origin);
  url.searchParams.set("token", token);
  return {
    url: url.toString(),
    token,
    expiresAt: new Date(JSON.parse(base64UrlDecode(token.split(".")[0] ?? "")).exp).toISOString(),
  };
}

export function verifySignedReviewToken(input: {
  token: string | undefined;
  kind: SignedReviewKind;
  id: string;
  now?: Date;
}): SignedReviewTokenPayload | null {
  const token = input.token?.trim();
  if (!token) return null;

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) return null;

  const expectedSignature = sign(encodedPayload);
  const given = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  const value = payload as Partial<SignedReviewTokenPayload>;
  if (value.v !== 1 || value.scope !== "review") return null;
  if (value.kind !== input.kind || value.id !== input.id) return null;
  if (typeof value.exp !== "number" || !Number.isFinite(value.exp)) return null;
  const nowMs = input.now?.getTime() ?? Date.now();
  if (value.exp <= nowMs) return null;
  return value as SignedReviewTokenPayload;
}

export function signedReviewTtlMsFromQuery(value: unknown) {
  return parsePositiveTtlMs(value);
}
