import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/api/portal";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlusCircle, Ticket } from "lucide-react";

function statusVariant(status: string): "default" | "secondary" | "outline" {
  if (status === "done" || status === "cancelled") return "secondary";
  if (status === "in_progress" || status === "in_review") return "default";
  return "outline";
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function PortalDashboardPage() {
  const navigate = useNavigate();

  const { data: me } = useQuery({
    queryKey: ["portal", "me"],
    queryFn: () => portalApi.me(),
    retry: false,
  });

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["portal", "tickets"],
    queryFn: () => portalApi.tickets.list(),
    retry: false,
  });

  const openTickets = tickets?.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  ) ?? [];
  const recentTickets = tickets?.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">
            Hello {me?.name ?? "there"}, here are your open requests
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Track and manage your support tickets below.
          </p>
        </div>
        <Button
          onClick={() => navigate("/portal/tickets/new")}
          className="shrink-0 flex items-center gap-1.5"
        >
          <PlusCircle className="h-4 w-4" />
          Submit New Request
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Open Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-muted-foreground" />
              <span className="text-3xl font-bold">
                {isLoading ? "—" : openTickets.length}
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-muted-foreground" />
              <span className="text-3xl font-bold">
                {isLoading ? "—" : (tickets?.length ?? 0)}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent tickets */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base">Recent Requests</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate("/portal/tickets")}
          >
            View all
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Loading...
            </p>
          )}
          {!isLoading && recentTickets.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No requests yet.{" "}
              <button
                onClick={() => navigate("/portal/tickets/new")}
                className="underline hover:no-underline"
              >
                Submit your first one.
              </button>
            </p>
          )}
          {recentTickets.length > 0 && (
            <ul className="divide-y divide-border">
              {recentTickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="py-3 flex items-center justify-between gap-4 cursor-pointer hover:bg-muted/50 -mx-2 px-2 rounded"
                  onClick={() => navigate(`/portal/tickets/${ticket.id}`)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                      {ticket.agentName ? ` · Assigned to ${ticket.agentName}` : ""}
                    </p>
                  </div>
                  <Badge variant={statusVariant(ticket.status)} className="shrink-0 capitalize">
                    {formatStatus(ticket.status)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
