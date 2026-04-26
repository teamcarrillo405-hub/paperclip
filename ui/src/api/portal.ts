const BASE = "/api/portal";

export class PortalApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "PortalApiError";
    this.status = status;
    this.body = body;
  }
}

function getToken(): string | null {
  return localStorage.getItem("avero.portal.token");
}

async function request<T>(
  path: string,
  init?: RequestInit,
  withAuth = true,
): Promise<T> {
  const headers = new Headers(init?.headers ?? undefined);
  const body = init?.body;
  if (!(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (withAuth) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  const res = await fetch(`${BASE}${path}`, { headers, ...init });
  if (!res.ok) {
    const errorBody = await res.json().catch(() => null);
    throw new PortalApiError(
      (errorBody as { error?: string } | null)?.error ?? `Request failed: ${res.status}`,
      res.status,
      errorBody,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortalBranding {
  productName: string;
  primaryColor: string;
  logoUrl: string | null;
}

export interface PortalUserMe {
  id: string;
  name: string;
  email: string;
  companyId: string;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface PortalTicketSummary {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  agentName: string | null;
}

export interface PortalMessage {
  id: string;
  body: string;
  createdAt: string;
  fromAgent: boolean;
  authorName: string | null;
}

export interface PortalTicketDetail extends PortalTicketSummary {
  description: string | null;
  messages: PortalMessage[];
}

export interface PortalLoginResponse {
  token: string;
  user: {
    id: string;
    name: string;
    email: string;
    companyId: string;
  };
}

// ---------------------------------------------------------------------------
// API client
// ---------------------------------------------------------------------------

export const portalApi = {
  branding: (): Promise<PortalBranding> =>
    request<PortalBranding>("/branding", undefined, false),

  login: (email: string, password: string): Promise<PortalLoginResponse> =>
    request<PortalLoginResponse>(
      "/auth/login",
      { method: "POST", body: JSON.stringify({ email, password }) },
      false,
    ),

  logout: (token: string): Promise<void> =>
    request<void>(
      "/auth/logout",
      { method: "POST", body: JSON.stringify({ token }) },
      false,
    ),

  me: (): Promise<PortalUserMe> => request<PortalUserMe>("/me"),

  tickets: {
    list: (): Promise<PortalTicketSummary[]> =>
      request<PortalTicketSummary[]>("/tickets"),

    get: (id: string): Promise<PortalTicketDetail> =>
      request<PortalTicketDetail>(`/tickets/${id}`),

    create: (data: { title: string; description?: string }): Promise<PortalTicketSummary> =>
      request<PortalTicketSummary>("/tickets", {
        method: "POST",
        body: JSON.stringify(data),
      }),

    addMessage: (id: string, content: string): Promise<PortalMessage> =>
      request<PortalMessage>(`/tickets/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ content }),
      }),
  },
};
