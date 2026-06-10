import { describe, expect, it, beforeEach } from "vitest";
import {
  createSignedReviewToken,
  verifySignedReviewToken,
} from "../services/signed-review-links.js";

describe("signed review links", () => {
  beforeEach(() => {
    process.env.PAPERCLIP_SIGNED_REVIEW_SECRET = "test-review-secret";
  });

  it("accepts a token for the exact review resource", () => {
    const token = createSignedReviewToken({
      kind: "approval",
      id: "approval-1",
      ttlMs: 60_000,
      now: new Date("2026-06-09T20:00:00Z"),
    });

    const payload = verifySignedReviewToken({
      token,
      kind: "approval",
      id: "approval-1",
      now: new Date("2026-06-09T20:00:01Z"),
    });

    expect(payload).toMatchObject({
      scope: "review",
      kind: "approval",
      id: "approval-1",
    });
  });

  it("rejects tokens for a different resource", () => {
    const token = createSignedReviewToken({
      kind: "approval",
      id: "approval-1",
      ttlMs: 60_000,
      now: new Date("2026-06-09T20:00:00Z"),
    });

    expect(verifySignedReviewToken({
      token,
      kind: "approval",
      id: "approval-2",
      now: new Date("2026-06-09T20:00:01Z"),
    })).toBeNull();
  });

  it("rejects expired tokens", () => {
    const token = createSignedReviewToken({
      kind: "hcc_queue",
      id: "queue-1",
      ttlMs: 1_000,
      now: new Date("2026-06-09T20:00:00Z"),
    });

    expect(verifySignedReviewToken({
      token,
      kind: "hcc_queue",
      id: "queue-1",
      now: new Date("2026-06-09T20:00:02Z"),
    })).toBeNull();
  });
});
