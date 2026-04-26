import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { portalApi } from "@/api/portal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Send } from "lucide-react";

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
  return "bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
}

function formatStatus(status: string): string {
  return status.replace(/_/g, " ");
}

export function PortalTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const { data: ticket, isLoading } = useQuery({
    queryKey: ["portal", "tickets", id],
    queryFn: () => portalApi.tickets.get(id!),
    enabled: !!id,
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: () => portalApi.tickets.addMessage(id!, message),
    onSuccess: () => {
      setMessage("");
      setSendError(null);
      void queryClient.invalidateQueries({ queryKey: ["portal", "tickets", id] });
    },
    onError: (err) => {
      setSendError(err instanceof Error ? err.message : "Failed to send message.");
    },
  });

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSendError(null);
    sendMutation.mutate();
  }

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Loading ticket...
      </p>
    );
  }

  if (!ticket) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Ticket not found.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/portal/tickets")}
          className="mt-0.5 shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-semibold">{ticket.title}</h1>
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor(ticket.status)}`}
            >
              {formatStatus(ticket.status)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Opened {new Date(ticket.createdAt).toLocaleString()}
            {ticket.agentName ? ` · Assigned to ${ticket.agentName}` : ""}
          </p>
        </div>
      </div>

      {/* Description */}
      {ticket.description && (
        <div className="rounded-lg border border-border bg-muted/30 px-4 py-3">
          <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
        </div>
      )}

      {/* Thread */}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Conversation
        </h2>

        {ticket.messages.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No messages yet. Send one below.
          </p>
        )}

        <div className="space-y-2">
          {ticket.messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.fromAgent ? "justify-start" : "justify-end"}`}
            >
              <div
                className={`max-w-[75%] rounded-lg px-4 py-2.5 text-sm ${
                  msg.fromAgent
                    ? "bg-muted text-foreground"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {msg.fromAgent && msg.authorName && (
                  <p className="text-xs font-medium mb-1 opacity-70">
                    {msg.authorName}
                  </p>
                )}
                <p className="whitespace-pre-wrap">{msg.body}</p>
                <p
                  className={`text-xs mt-1 ${
                    msg.fromAgent ? "text-muted-foreground" : "opacity-70"
                  }`}
                >
                  {new Date(msg.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Reply box */}
      <form onSubmit={handleSend} className="space-y-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          rows={3}
          disabled={sendMutation.isPending}
        />
        {sendError && (
          <p className="text-sm text-destructive">{sendError}</p>
        )}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={sendMutation.isPending || !message.trim()}
            className="flex items-center gap-1.5"
          >
            <Send className="h-4 w-4" />
            {sendMutation.isPending ? "Sending..." : "Send"}
          </Button>
        </div>
      </form>
    </div>
  );
}
