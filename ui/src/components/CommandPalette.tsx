import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "@/lib/router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useSidebar } from "../context/SidebarContext";
import { issuesApi } from "../api/issues";
import { agentsApi } from "../api/agents";
import { approvalsApi } from "../api/approvals";
import { heartbeatsApi } from "../api/heartbeats";
import { projectsApi } from "../api/projects";
import { queryKeys } from "../lib/queryKeys";
import { approvalSubject, typeLabel } from "./ApprovalPayload";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  CircleDot,
  Bot,
  Hexagon,
  Target,
  LayoutDashboard,
  Inbox,
  DollarSign,
  History,
  SquarePen,
  Plus,
  StopCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Pin,
  PinOff,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Identity } from "./Identity";
import { agentUrl, projectUrl } from "../lib/utils";

// ---------------------------------------------------------------------------
// Fuzzy scoring — pure, outside component
// ---------------------------------------------------------------------------

function fuzzyScore(query: string, target: string): number {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 90;
  if (t.includes(q)) return 70;
  // character subsequence match
  let qi = 0;
  let score = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { score++; qi++; }
  }
  if (qi < q.length) return 0; // not all query chars found
  return Math.round((score / q.length) * 50);
}

// ---------------------------------------------------------------------------
// Recent commands — stored in localStorage
// ---------------------------------------------------------------------------

const RECENT_STORAGE_KEY = "avero:cmd:recent";
const MAX_RECENT = 5;
const PINNED_STORAGE_KEY = "avero:cmd:pinned";
const MAX_PINNED = 8;

interface RecentCommand {
  id: string;
  label: string;
  path?: string;
  action?: string;
}

interface PinnedCommand {
  id: string;
  label: string;
  path: string;
}

const NAV_ITEMS: Array<{ id: string; label: string; path: string; icon: LucideIcon }> = [
  { id: "nav:/dashboard", label: "Dashboard", path: "/dashboard", icon: LayoutDashboard },
  { id: "nav:/inbox", label: "Inbox", path: "/inbox", icon: Inbox },
  { id: "nav:/issues", label: "Issues", path: "/issues", icon: CircleDot },
  { id: "nav:/projects", label: "Projects", path: "/projects", icon: Hexagon },
  { id: "nav:/goals", label: "Goals", path: "/goals", icon: Target },
  { id: "nav:/agents", label: "Agents", path: "/agents", icon: Bot },
  { id: "nav:/costs", label: "Costs", path: "/costs", icon: DollarSign },
  { id: "nav:/activity", label: "Activity", path: "/activity", icon: History },
];

function readRecent(): RecentCommand[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as RecentCommand[];
  } catch {
    return [];
  }
}

function writeRecent(commands: RecentCommand[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(commands.slice(0, MAX_RECENT)));
  } catch {
    // fail silently
  }
}

function pushRecent(command: RecentCommand): void {
  const existing = readRecent().filter((c) => c.id !== command.id);
  writeRecent([command, ...existing]);
}

// ---------------------------------------------------------------------------
// Keyboard shortcut badge
// ---------------------------------------------------------------------------

function KbdBadge({ keys }: { keys: string }) {
  return (
    <span className="ml-auto flex items-center gap-0.5 shrink-0">
      {keys.split("+").map((k, i) => (
        <kbd
          key={i}
          className="inline-flex items-center justify-center rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium leading-none text-muted-foreground border border-border"
        >
          {k}
        </kbd>
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [recentCommands, setRecentCommands] = useState<RecentCommand[]>([]);
  const [pinned, setPinned] = useState<PinnedCommand[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) ?? "[]");
    } catch {
      return [];
    }
  });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompany();
  const { openNewIssue, openNewAgent } = useDialog();
  const { isMobile, setSidebarOpen } = useSidebar();
  const searchQuery = query.trim();

  // Load recent commands whenever palette opens
  useEffect(() => {
    if (open) {
      setRecentCommands(readRecent());
    }
  }, [open]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen(true);
        if (isMobile) setSidebarOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isMobile, setSidebarOpen]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const { data: issues = [] } = useQuery({
    queryKey: queryKeys.issues.list(selectedCompanyId!),
    queryFn: () => issuesApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open && searchQuery.length === 0,
  });

  const { data: searchedIssues = [] } = useQuery({
    queryKey: queryKeys.issues.search(selectedCompanyId!, searchQuery, undefined, 10),
    queryFn: () => issuesApi.list(selectedCompanyId!, { q: searchQuery, limit: 10, includeRoutineExecutions: true }),
    enabled: !!selectedCompanyId && open && searchQuery.length > 0,
  });

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId!),
    queryFn: () => agentsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: allProjects = [] } = useQuery({
    queryKey: queryKeys.projects.list(selectedCompanyId!),
    queryFn: () => projectsApi.list(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });
  const projects = useMemo(
    () => allProjects.filter((p) => !p.archivedAt),
    [allProjects],
  );

  const { data: liveRuns = [] } = useQuery({
    queryKey: [...queryKeys.liveRuns(selectedCompanyId!), "cmd-palette"],
    queryFn: () => heartbeatsApi.liveRunsForCompany(selectedCompanyId!),
    enabled: !!selectedCompanyId && open,
  });

  const { data: pendingApprovals = [] } = useQuery({
    queryKey: queryKeys.approvals.list(selectedCompanyId!, "pending"),
    queryFn: () => approvalsApi.list(selectedCompanyId!, "pending"),
    enabled: !!selectedCompanyId && open,
  });

  const cancelRunMutation = useMutation({
    mutationFn: (runId: string) => heartbeatsApi.cancel(runId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(selectedCompanyId!) });
    },
  });

  const pauseAgentMutation = useMutation({
    mutationFn: (agentId: string) => agentsApi.pause(agentId, selectedCompanyId ?? undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(selectedCompanyId!) });
    },
  });

  const approveApprovalMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.approve(id),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
      navigate(`/approvals/${id}?resolved=approved`);
    },
  });

  const rejectApprovalMutation = useMutation({
    mutationFn: (id: string) => approvalsApi.reject(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.approvals.list(selectedCompanyId!) });
    },
  });

  // Active runs (running or queued), deduplicated to one per agent
  const activeRunsByAgent = useMemo(() => {
    const map = new Map<string, (typeof liveRuns)[number]>();
    for (const run of liveRuns) {
      if (run.status !== "running" && run.status !== "queued") continue;
      if (!map.has(run.agentId)) map.set(run.agentId, run);
    }
    return [...map.values()];
  }, [liveRuns]);

  const pendingApprovalsFiltered = useMemo(
    () => pendingApprovals.filter((a) => a.status === "pending" || a.status === "revision_requested"),
    [pendingApprovals],
  );

  const go = useCallback(
    (path: string, label: string) => {
      pushRecent({ id: `nav:${path}`, label, path });
      setOpen(false);
      navigate(path);
    },
    [navigate],
  );

  const runAction = useCallback(
    (id: string, label: string, fn: () => void) => {
      pushRecent({ id: `action:${id}`, label, action: id });
      setOpen(false);
      fn();
    },
    [],
  );

  const togglePin = useCallback((cmd: PinnedCommand) => {
    setPinned((prev) => {
      const already = prev.some((p) => p.id === cmd.id);
      const next = already
        ? prev.filter((p) => p.id !== cmd.id)
        : prev.length >= MAX_PINNED ? prev : [...prev, cmd];
      try { localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const isPinned = useCallback((id: string) => pinned.some((p) => p.id === id), [pinned]);

  const agentName = (id: string | null) => {
    if (!id) return null;
    return agents.find((a) => a.id === id)?.name ?? null;
  };

  const visibleIssues = useMemo(
    () => (searchQuery.length > 0 ? searchedIssues : issues),
    [issues, searchedIssues, searchQuery],
  );

  const fuzzyAgents = useMemo(() => {
    if (!searchQuery) return agents.slice(0, 10);
    return agents
      .map((a) => ({ agent: a, score: fuzzyScore(searchQuery, a.name) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.agent);
  }, [agents, searchQuery]);

  const fuzzyProjects = useMemo(() => {
    if (!searchQuery) return projects.slice(0, 10);
    return projects
      .map((p) => ({ project: p, score: fuzzyScore(searchQuery, p.name) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.project);
  }, [projects, searchQuery]);

  const rankedIssues = useMemo(() => {
    if (!searchQuery) return visibleIssues.slice(0, 10);
    return [...visibleIssues]
      .sort((a, b) => fuzzyScore(searchQuery, b.title) - fuzzyScore(searchQuery, a.title))
      .slice(0, 10);
  }, [visibleIssues, searchQuery]);

  // Execute a recent command
  function executeRecent(cmd: RecentCommand) {
    pushRecent(cmd); // re-push to surface it at top
    setOpen(false);
    if (cmd.path) {
      navigate(cmd.path);
    } else if (cmd.action === "new-issue") {
      openNewIssue();
    } else if (cmd.action === "new-agent") {
      openNewAgent();
    }
  }

  const showRecent = recentCommands.length > 0 && searchQuery.length === 0;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v && isMobile) setSidebarOpen(false);
      }}
    >
      <CommandInput
        placeholder="Search issues, agents, projects..."
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        {/* Pinned commands */}
        {pinned.length > 0 && searchQuery.length === 0 && (
          <>
            <CommandGroup heading="Pinned">
              {pinned.map((cmd) => (
                <CommandItem
                  key={`pinned-${cmd.id}`}
                  value={`pinned-${cmd.id}`}
                  onSelect={() => go(cmd.path, cmd.label)}
                  className="group/item flex items-center justify-between"
                >
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    <Pin className="h-3.5 w-3.5 text-primary shrink-0" />
                    {cmd.label}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); togglePin(cmd); }}
                    className="opacity-0 group-hover/item:opacity-100 transition-opacity ml-auto p-0.5 text-muted-foreground hover:text-foreground shrink-0"
                    title="Unpin"
                  >
                    <PinOff className="h-3 w-3" />
                  </button>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Recent commands */}
        {showRecent && (
          <>
            <CommandGroup heading="Recent">
              {recentCommands.map((cmd) => (
                <CommandItem key={cmd.id} onSelect={() => executeRecent(cmd)}>
                  <History className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{cmd.label}</span>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Actions */}
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={() =>
              runAction("new-issue", "Create new issue", () => openNewIssue())
            }
          >
            <SquarePen className="mr-2 h-4 w-4" />
            Create new issue
            <KbdBadge keys="C" />
          </CommandItem>
          <CommandItem
            onSelect={() =>
              runAction("new-agent", "Create new agent", () => openNewAgent())
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Create new agent
          </CommandItem>
          <CommandItem
            onSelect={() => go("/projects", "Create new project")}
          >
            <Plus className="mr-2 h-4 w-4" />
            Create new project
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        {/* Navigate */}
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((item) => (
            <CommandItem
              key={item.id}
              onSelect={() => go(item.path, item.label)}
              className="group/item flex items-center justify-between"
            >
              <span className="flex items-center gap-2 min-w-0 flex-1">
                <item.icon className="h-4 w-4 shrink-0" />
                {item.label}
              </span>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); togglePin({ id: item.id, label: item.label, path: item.path }); }}
                className="opacity-0 group-hover/item:opacity-100 transition-opacity ml-2 p-0.5 text-muted-foreground hover:text-primary shrink-0"
                title={isPinned(item.id) ? "Unpin" : "Pin"}
              >
                {isPinned(item.id) ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </button>
            </CommandItem>
          ))}
        </CommandGroup>

        {activeRunsByAgent.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agent Operations">
              {activeRunsByAgent.map((run) => (
                <>
                  <CommandItem
                    key={`cancel-${run.id}`}
                    onSelect={() =>
                      runAction(`cancel-run-${run.id}`, `Cancel run — ${run.agentName}`, () =>
                        cancelRunMutation.mutate(run.id),
                      )
                    }
                  >
                    <StopCircle className="mr-2 h-4 w-4 text-destructive/70" />
                    <span className="flex-1 truncate">Cancel run &mdash; {run.agentName}</span>
                  </CommandItem>
                  <CommandItem
                    key={`pause-${run.agentId}`}
                    onSelect={() =>
                      runAction(`pause-agent-${run.agentId}`, `Pause agent — ${run.agentName}`, () =>
                        pauseAgentMutation.mutate(run.agentId),
                      )
                    }
                  >
                    <PauseCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">Pause agent &mdash; {run.agentName}</span>
                  </CommandItem>
                </>
              ))}
            </CommandGroup>
          </>
        )}

        {pendingApprovalsFiltered.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Pending Approvals">
              {pendingApprovalsFiltered.slice(0, 8).map((approval) => {
                const payload = approval.payload as Record<string, unknown> | null;
                const subject = approvalSubject(payload) ?? typeLabel[approval.type] ?? approval.type;
                return (
                  <>
                    <CommandItem
                      key={`approve-${approval.id}`}
                      onSelect={() =>
                        runAction(`approve-${approval.id}`, `Approve — ${subject}`, () =>
                          approveApprovalMutation.mutate(approval.id),
                        )
                      }
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                      <span className="flex-1 truncate">Approve &mdash; {subject}</span>
                    </CommandItem>
                    <CommandItem
                      key={`reject-${approval.id}`}
                      onSelect={() =>
                        runAction(`reject-${approval.id}`, `Reject — ${subject}`, () =>
                          rejectApprovalMutation.mutate(approval.id),
                        )
                      }
                    >
                      <XCircle className="mr-2 h-4 w-4 text-destructive/70" />
                      <span className="flex-1 truncate">Reject &mdash; {subject}</span>
                    </CommandItem>
                  </>
                );
              })}
            </CommandGroup>
          </>
        )}

        {rankedIssues.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Issues">
              {rankedIssues.map((issue) => (
                <CommandItem
                  key={issue.id}
                  value={
                    searchQuery.length > 0
                      ? `${searchQuery} ${issue.identifier ?? ""} ${issue.title}`
                      : undefined
                  }
                  onSelect={() =>
                    go(
                      `/issues/${issue.identifier ?? issue.id}`,
                      issue.title,
                    )
                  }
                >
                  <CircleDot className="mr-2 h-4 w-4" />
                  <span className="text-muted-foreground mr-2 font-mono text-xs">
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                  <span className="flex-1 truncate">{issue.title}</span>
                  {issue.assigneeAgentId && (() => {
                    const name = agentName(issue.assigneeAgentId);
                    return name ? <Identity name={name} size="sm" className="ml-2 hidden sm:inline-flex" /> : null;
                  })()}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {fuzzyAgents.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agents">
              {fuzzyAgents.map((agent) => (
                <CommandItem
                  key={agent.id}
                  onSelect={() => go(agentUrl(agent), agent.name)}
                >
                  <Bot className="mr-2 h-4 w-4" />
                  {agent.name}
                  <span className="text-xs text-muted-foreground ml-2">{agent.role}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}

        {fuzzyProjects.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Projects">
              {fuzzyProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  onSelect={() => go(projectUrl(project), project.name)}
                >
                  <Hexagon className="mr-2 h-4 w-4" />
                  {project.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
