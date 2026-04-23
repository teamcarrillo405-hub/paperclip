import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Loader2, Play, CheckCircle2, XCircle, Ban, Download } from "lucide-react";
import { gooseApi, type GooseTaskRecord, type GooseTaskStatus } from "../api/goose";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const STATUS_QUERY_KEY = ["goose", "status"] as const;
const TASKS_QUERY_KEY = ["goose", "tasks"] as const;

function StatusBadge({ status }: { status: GooseTaskStatus }) {
  if (status === "running") {
    return (
      <Badge variant="secondary" className="gap-1">
        <Loader2 className="h-3 w-3 animate-spin" /> Running
      </Badge>
    );
  }
  if (status === "completed") {
    return (
      <Badge className="gap-1 bg-green-600 text-white hover:bg-green-600/90">
        <CheckCircle2 className="h-3 w-3" /> Completed
      </Badge>
    );
  }
  if (status === "failed") {
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" /> Failed
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="gap-1">
      <Ban className="h-3 w-3" /> Cancelled
    </Badge>
  );
}

function formatDuration(task: GooseTaskRecord): string {
  if (!task.completedAt) return "—";
  const start = new Date(task.startedAt).getTime();
  const end = new Date(task.completedAt).getTime();
  const seconds = Math.max(0, Math.round((end - start) / 1000));
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

export function AutonomousTasksPage() {
  const qc = useQueryClient();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: "Autonomous Tasks" }]);
    return () => setBreadcrumbs([]);
  }, [setBreadcrumbs]);

  const statusQuery = useQuery({
    queryKey: STATUS_QUERY_KEY,
    queryFn: () => gooseApi.status(),
  });

  const hasRunning = false; // will be computed after tasksQuery

  const tasksQuery = useQuery({
    queryKey: TASKS_QUERY_KEY,
    queryFn: () => gooseApi.list(),
    refetchInterval: (query) => {
      const data = query.state.data;
      return Array.isArray(data) && data.some((t) => t.status === "running") ? 3000 : false;
    },
  });

  const runTask = useMutation({
    mutationFn: (templateName: string) => gooseApi.create({ templateName }),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });

  const cancelTask = useMutation({
    mutationFn: (id: string) => gooseApi.cancel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_QUERY_KEY }),
  });

  const [selectedTask, setSelectedTask] = useState<GooseTaskRecord | null>(null);

  const templateEntries = useMemo(() => {
    const details = statusQuery.data?.templateDetails;
    if (!details) return [];
    return Object.entries(details);
  }, [statusQuery.data]);

  const installed = statusQuery.data?.installed ?? false;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Bot className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Autonomous Tasks</h1>
          <p className="text-sm text-muted-foreground">
            Run multi-step autonomous agent tasks with Goose CLI.
          </p>
        </div>
      </div>

      {!statusQuery.isLoading && !installed ? (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader className="flex-row items-center gap-3">
            <Download className="h-5 w-5 text-amber-600" />
            <div>
              <CardTitle>Goose CLI is not installed</CardTitle>
              <CardDescription>
                Install it to run autonomous tasks on this host.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p>
              Download from{" "}
              <a
                href="https://github.com/block/goose"
                className="underline"
                target="_blank"
                rel="noreferrer"
              >
                github.com/block/goose
              </a>{" "}
              or install via <code className="rounded bg-muted px-1">pip install goose-ai</code>.
            </p>
            <p className="text-muted-foreground">
              Ensure the <code className="rounded bg-muted px-1">goose</code> binary is on the server PATH,
              then restart the server.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {installed ? (
        <Card className="border-green-400/60 bg-green-50 dark:bg-green-950/30">
          <CardHeader className="flex-row items-center gap-3">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            <div>
              <CardTitle>Goose CLI is ready</CardTitle>
              <CardDescription>Pick a template below to kick off an autonomous task.</CardDescription>
            </div>
          </CardHeader>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        {templateEntries.map(([name, t]) => (
          <Card key={name}>
            <CardHeader>
              <CardTitle>{t.name}</CardTitle>
              <CardDescription>{t.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={() => runTask.mutate(name)}
                disabled={!installed || runTask.isPending}
                className="gap-2"
              >
                <Play className="h-4 w-4" />
                {runTask.isPending && runTask.variables === name ? "Starting..." : "Run Now"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Recent Tasks</h2>
        <Card>
          <CardContent className="p-0">
            {tasksQuery.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Loading...</div>
            ) : !tasksQuery.data || tasksQuery.data.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">No tasks yet. Run one above.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground border-b">
                  <tr>
                    <th className="p-3 font-medium">Task</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Duration</th>
                    <th className="p-3 font-medium">Started</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {tasksQuery.data.map((task) => (
                    <tr key={task.id} className="border-b last:border-b-0">
                      <td className="p-3">
                        <div className="font-medium">
                          {task.templateName
                            ? statusQuery.data?.templateDetails[task.templateName]?.name ??
                              task.templateName
                            : "Custom"}
                        </div>
                        <div className="text-xs text-muted-foreground line-clamp-1">
                          {task.instructions}
                        </div>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={task.status} />
                      </td>
                      <td className="p-3">{formatDuration(task)}</td>
                      <td className="p-3 text-muted-foreground">
                        {new Date(task.startedAt).toLocaleString()}
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex gap-2 justify-end">
                          {task.status === "running" ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancelTask.mutate(task.id)}
                              disabled={cancelTask.isPending}
                            >
                              Cancel
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setSelectedTask(task)}
                          >
                            View Output
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </section>

      <Dialog open={!!selectedTask} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Task Output</DialogTitle>
            <DialogDescription>
              {selectedTask
                ? `Task ${selectedTask.id.slice(0, 8)} · ${selectedTask.status}`
                : null}
            </DialogDescription>
          </DialogHeader>
          {selectedTask ? (
            <div className="space-y-3">
              <div className="text-xs text-muted-foreground">
                <div>
                  <span className="font-medium">Instructions:</span>{" "}
                  {selectedTask.instructions}
                </div>
              </div>
              <pre className="max-h-[60vh] overflow-auto rounded-md bg-muted p-3 text-xs font-mono whitespace-pre-wrap">
                {selectedTask.output || "(no output yet)"}
              </pre>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AutonomousTasksPage;
