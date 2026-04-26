import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { portalApi } from "@/api/portal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";

function statusVariant(
  status: string,
): "default" | "secondary" | "outline" {
  if (status === "in_progress" || status === "in_review") return "default";
  if (status === "done" || status === "cancelled") return "secondary";
  return "outline";
}

function statusColor(status: string): string {
  if (status === "in_progress" || status === "in_review") {
    return "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400";
  }
  if (status === "done") {
    return "bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400";
  }
  if (status === "cancelled") {
    return "bg-muted text-muted-foreground";
  }
  // backlog / todo / blocked
  return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function PortalTicketsPage() {
  const navigate = useNavigate();

  const { data: tickets, isLoading } = useQuery({
    queryKey: ["portal", "tickets"],
    queryFn: () => portalApi.tickets.list(),
    retry: false,
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">All Requests</h1>
        <Button
          onClick={() => navigate("/portal/tickets/new")}
          className="flex items-center gap-1.5"
        >
          <PlusCircle className="h-4 w-4" />
          New Request
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {isLoading ? "Loading..." : `${tickets?.length ?? 0} requests`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!isLoading && (!tickets || tickets.length === 0) && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No requests yet.
            </p>
          )}
          {tickets && tickets.length > 0 && (
            <ul className="divide-y divide-border">
              {tickets.map((ticket) => (
                <li
                  key={ticket.id}
                  className="flex items-center justify-between gap-4 px-6 py-3.5 cursor-pointer hover:bg-muted/50"
                  onClick={() => navigate(`/portal/tickets/${ticket.id}`)}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{ticket.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(ticket.createdAt).toLocaleDateString()}
                      {ticket.agentName ? ` · ${ticket.agentName}` : ""}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor(ticket.status)}`}
                  >
                    {formatStatus(ticket.status)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
