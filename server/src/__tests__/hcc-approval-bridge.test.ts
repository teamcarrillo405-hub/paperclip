import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { syncHccApprovalDecision } from "../services/hcc-approval-bridge.js";

describe("syncHccApprovalDecision", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.HCC_APPROVAL_BRIDGE_URL = "http://127.0.0.1:18800";
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  afterEach(() => {
    delete process.env.HCC_APPROVAL_BRIDGE_URL;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it.each([
    ["hcc_queue_id", { hcc_queue_id: " queue-snake " }],
    ["hccQueueId", { hccQueueId: " queue-camel " }],
    ["queue_id", { queue_id: " queue-generic-snake " }],
    ["queueId", { queueId: " queue-generic-camel " }],
  ])("syncs HCC approvals using %s payload keys", async (_label, payload) => {
    const result = await syncHccApprovalDecision(
      { id: "approval-1", payload },
      "approve",
      "Approved",
    );

    expect(result.skipped).toBe(false);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0]!;
    expect(url).toBe("http://127.0.0.1:18800/queue/approve");
    expect(JSON.parse(String(init?.body))).toEqual({ id: Object.values(payload)[0].trim() });
  });

  it("skips approvals without an HCC queue id", async () => {
    const result = await syncHccApprovalDecision(
      { id: "approval-1", payload: { title: "Regular approval" } },
      "approve",
    );

    expect(result).toEqual({ skipped: true, reason: "not_hcc_approval" });
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
