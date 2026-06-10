import { http, HttpResponse } from "msw";
import {
  storybookAgents,
  storybookApprovals,
  storybookAuthSession,
  storybookCompanies,
  storybookDashboardSummary,
  storybookIssues,
  storybookLiveRuns,
  storybookProjects,
  storybookSidebarBadges,
} from "../fixtures/paperclipData";

const fallbackSidebarBadges = { inbox: 0, approvals: 0, failedRuns: 0, joinRequests: 0 };

export const mswHandlers = [
  http.get("/api/auth/get-session", () => HttpResponse.json(storybookAuthSession)),
  http.get("/api/companies", () => HttpResponse.json(storybookCompanies)),
  http.get("/api/companies/company-storybook/user-directory", () =>
    HttpResponse.json({
      users: [
        {
          principalId: "user-board",
          status: "active",
          user: {
            id: "user-board",
            email: "board@paperclip.local",
            name: "Board Operator",
            image: null,
          },
        },
        {
          principalId: "user-product",
          status: "active",
          user: {
            id: "user-product",
            email: "product@paperclip.local",
            name: "Product Lead",
            image: null,
          },
        },
      ],
    }),
  ),
  http.get("/api/instance/settings/experimental", () =>
    HttpResponse.json({
      enableIsolatedWorkspaces: true,
      autoRestartDevServerWhenIdle: false,
    }),
  ),
  http.get("/api/plugins/ui-contributions", () => HttpResponse.json([])),
  http.get("/api/companies/:companyId/agents", ({ params }) =>
    HttpResponse.json(params.companyId === "company-storybook" ? storybookAgents : []),
  ),
  http.get("/api/companies/:companyId/projects", ({ params }) =>
    HttpResponse.json(params.companyId === "company-storybook" ? storybookProjects : []),
  ),
  http.get("/api/companies/:companyId/approvals", ({ params }) =>
    HttpResponse.json(params.companyId === "company-storybook" ? storybookApprovals : []),
  ),
  http.get("/api/companies/:companyId/dashboard", ({ params }) =>
    HttpResponse.json({
      ...storybookDashboardSummary,
      companyId: params.companyId,
    }),
  ),
  http.get("/api/companies/:companyId/heartbeat-runs", () => HttpResponse.json([])),
  http.get("/api/companies/:companyId/live-runs", ({ params }) =>
    HttpResponse.json(params.companyId === "company-storybook" ? storybookLiveRuns : []),
  ),
  http.get("/api/companies/:companyId/inbox-dismissals", () => HttpResponse.json([])),
  http.get("/api/companies/:companyId/sidebar-badges", ({ params }) =>
    HttpResponse.json(params.companyId === "company-storybook" ? storybookSidebarBadges : fallbackSidebarBadges),
  ),
  http.get("/api/companies/:companyId/join-requests", () => HttpResponse.json([])),
  http.get("/api/companies/:companyId/issues", ({ params, request }) => {
    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim().toLowerCase();
    const issues = params.companyId === "company-storybook" ? storybookIssues : [];
    return HttpResponse.json(
      query
        ? issues.filter((issue) =>
            `${issue.identifier ?? ""} ${issue.title} ${issue.description ?? ""}`.toLowerCase().includes(query),
          )
        : issues,
    );
  }),
  http.get("/api/invites/:inviteId/logo", () => new HttpResponse(null, { status: 204 })),
];
