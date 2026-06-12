type HccBridgeAction = "approve" | "reject" | "request-revision";

type HccApprovalLike = {
  id: string;
  payload: Record<string, unknown> | null;
};

function hccQueueId(payload: Record<string, unknown> | null): string | null {
  const candidates = [
    payload?.hcc_queue_id,
    payload?.hccQueueId,
    payload?.queue_id,
    payload?.queueId,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function endpointFor(action: HccBridgeAction): string {
  if (action === "approve") return "/queue/approve";
  if (action === "reject") return "/queue/reject";
  return "/request-changes";
}

function bodyFor(action: HccBridgeAction, id: string, decisionNote?: string | null) {
  if (action === "approve") return { id };
  if (action === "reject") {
    return { id, reason: decisionNote || "CEO rejected this approval item." };
  }
  return {
    id,
    notes: decisionNote || "CEO requested changes through Paperclip.",
    requestedBy: "Paperclip",
    timestamp: new Date().toISOString(),
  };
}

export async function syncHccApprovalDecision(
  approval: HccApprovalLike,
  action: HccBridgeAction,
  decisionNote?: string | null,
) {
  const queueId = hccQueueId(approval.payload);
  if (!queueId) {
    return { skipped: true as const, reason: "not_hcc_approval" };
  }

  const baseUrl = process.env.HCC_APPROVAL_BRIDGE_URL || "http://127.0.0.1:18800";
  const response = await fetch(`${baseUrl}${endpointFor(action)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyFor(action, queueId, decisionNote)),
  });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HCC approval bridge failed (${response.status}): ${text.slice(0, 250)}`);
  }
  return { skipped: false as const, queueId, response: data };
}
