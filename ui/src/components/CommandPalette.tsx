import { Fragment, useState, useEffect, useMemo, useCallback, type ReactNode } from "react";
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
  FolderKanban,
  Target,
  LayoutDashboard,
  Inbox,
  DollarSign,
  History,

  StopCircle,
  PauseCircle,
  CheckCircle2,
  XCircle,
  Pin,
  PinOff,
  Timer,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Identity } from "./Identity";
import { agentUrl, projectUrl, cn } from "../lib/utils";

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

const NAV_ITEMS: Array<{ id: string; label: string; path: string; icon: LucideIcon; kbd?: string }> = [
  { id: "nav:/dashboard", label: "Dashboard", path: "/dashboard", icon: LayoutDashboard, kbd: "D" },
  { id: "nav:/inbox", label: "Inbox", path: "/inbox", icon: Inbox, kbd: "I" },
  { id: "nav:/issues", label: "Issues", path: "/issues", icon: CircleDot, kbd: "S" },
  { id: "nav:/projects", label: "Projects", path: "/projects", icon: Hexagon, kbd: "P" },
  { id: "nav:/goals", label: "Goals", path: "/goals", icon: Target, kbd: "G" },
  { id: "nav:/agents", label: "Agents", path: "/agents", icon: Bot, kbd: "A" },
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
// Entity type chip
// ---------------------------------------------------------------------------

function EntityChip({ type }: { type: "issue" | "agent" | "project" | "goal" | "routine" }) {
  const config: Record<"issue" | "agent" | "project" | "goal" | "routine", { bg: string; Icon: typeof CircleDot }> = {
    issue:   { bg: "bg-blue-500/10 text-blue-500",       Icon: CircleDot },
    agent:   { bg: "bg-violet-500/10 text-violet-500",   Icon: Bot },
    project: { bg: "bg-emerald-500/10 text-emerald-500", Icon: FolderKanban },
    goal:    { bg: "bg-amber-500/10 text-amber-500",     Icon: Target },
    routine: { bg: "bg-slate-500/10 text-slate-500",     Icon: Timer },
  };
  const { bg, Icon } = config[type];
  return (
    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded", bg)}>
      <Icon className="h-3 w-3" />
    </span>
  );
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const tl = text.toLowerCase();
  const ql = query.toLowerCase();
  const idx = tl.indexOf(ql);
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <span className="font-semibold text-foreground">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
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

  // Action items for the Actions group — defined inside component to capture callbacks
  const ACTION_ITEMS = useMemo(() => [
    {
      id: "action-new-issue",
      label: "Create new issue",
      actionId: "new-issue",
      fn: () => openNewIssue(),
      icon: <EntityChip type="issue" />,
      kbd: "C",
    },
    {
      id: "action-new-agent",
      label: "Create new agent",
      actionId: "new-agent",
      fn: () => openNewAgent(),
      icon: <EntityChip type="agent" />,
      kbd: "A",
    },
    {
      id: "action-new-project",
      label: "Create new project",
      path: "/projects",
      icon: <EntityChip type="project" />,
      kbd: "P",
    },
    {
      id: "action-new-goal",
      label: "New Goal",
      value: "new goal create goal",
      path: "/goals?new=1",
      icon: <EntityChip type="goal" />,
      kbd: "G",
    },
    {
      id: "action-new-routine",
      label: "New Routine",
      value: "new routine automation schedule",
      path: "/routines?new=1",
      icon: <EntityChip type="routine" />,
    },
  ] as Array<{
    id: string;
    label: string;
    value?: string;
    actionId?: string;
    fn?: () => void;
    path?: string;
    icon: ReactNode;
    kbd?: string;
  }>, [openNewIssue, openNewAgent]);

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

        {/* Actions — hidden when query is non-empty and no action matches */}
        {(searchQuery.length === 0 || ACTION_ITEMS.some((a) => a.label.toLowerCase().includes(searchQuery.toLowerCase()))) && (
          <CommandGroup heading="Actions">
            {(searchQuery.length === 0 ? ACTION_ITEMS : ACTION_ITEMS.filter((a) => a.label.toLowerCase().includes(searchQuery.toLowerCase()))).map((action) => (
              <CommandItem
                key={action.id}
                value={action.value ?? action.label}
                onSelect={() => {
                  if (action.actionId) {
                    runAction(action.actionId, action.label, action.fn!);
                  } else if (action.path) {
                    go(action.path, action.label);
                  }
                }}
              >
                {action.icon}
                <span className="flex-1">{action.label}</span>
                {action.kbd && <KbdBadge keys={action.kbd} />}
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandSeparator />

        {/* Navigate — filtered to matching items when query is non-empty */}
        {(() => {
          const visibleNavItems = searchQuery.length === 0
            ? NAV_ITEMS
            : NAV_ITEMS.filter((item) => item.label.toLowerCase().includes(searchQuery.toLowerCase()));
          if (visibleNavItems.length === 0) return null;
          return (
            <CommandGroup heading="Navigate">
              {visibleNavItems.map((item) => (
                <CommandItem
                  key={item.id}
                  onSelect={() => go(item.path, item.label)}
                  className="group/item flex items-center justify-between"
                >
                  <span className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted">
                      <item.icon className="h-3 w-3 text-muted-foreground" />
                    </span>
                    <HighlightMatch text={item.label} query={searchQuery} />
                  </span>
                  <span className="flex items-center gap-2 ml-2">
                    {item.kbd && <KbdBadge keys={item.kbd} />}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); togglePin({ id: item.id, label: item.label, path: item.path }); }}
                      className="opacity-0 group-hover/item:opacity-100 transition-opacity p-0.5 text-muted-foreground hover:text-primary shrink-0"
                      title={isPinned(item.id) ? "Unpin" : "Pin"}
                    >
                      {isPinned(item.id) ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                    </button>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          );
        })()}

        {(() => {
          const filteredRuns = searchQuery.length === 0
            ? activeRunsByAgent
            : activeRunsByAgent.filter((r) => r.agentName?.toLowerCase().includes(searchQuery.toLowerCase()));
          return filteredRuns.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading="Agent Operations">
              {filteredRuns.map((run) => (
                <Fragment key={run.id}>
                  <CommandItem
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
                    onSelect={() =>
                      runAction(`pause-agent-${run.agentId}`, `Pause agent — ${run.agentName}`, () =>
                        pauseAgentMutation.mutate(run.agentId),
                      )
                    }
                  >
                    <PauseCircle className="mr-2 h-4 w-4 text-muted-foreground" />
                    <span className="flex-1 truncate">Pause agent &mdash; {run.agentName}</span>
                  </CommandItem>
                </Fragment>
              ))}
            </CommandGroup>
          </>
          ) : null;
        })()}

        {(() => {
          const visibleApprovals = searchQuery.length === 0
            ? pendingApprovalsFiltered.slice(0, 8)
            : pendingApprovalsFiltered.filter((a) => {
                const payload = a.payload as Record<string, unknown> | null;
                const subj = approvalSubject(payload) ?? typeLabel[a.type] ?? a.type;
                return subj.toLowerCase().includes(searchQuery.toLowerCase());
              }).slice(0, 8);
          return visibleApprovals.length > 0 ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={`Pending Approvals (${pendingApprovalsFiltered.length})`}>
              {visibleApprovals.map((approval) => {
                const payload = approval.payload as Record<string, unknown> | null;
                const subject = approvalSubject(payload) ?? typeLabel[approval.type] ?? approval.type;
                return (
                  <Fragment key={approval.id}>
                    <CommandItem
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
                      onSelect={() =>
                        runAction(`reject-${approval.id}`, `Reject — ${subject}`, () =>
                          rejectApprovalMutation.mutate(approval.id),
                        )
                      }
                    >
                      <XCircle className="mr-2 h-4 w-4 text-destructive/70" />
                      <span className="flex-1 truncate">Reject &mdash; {subject}</span>
                    </CommandItem>
                  </Fragment>
                );
              })}
            </CommandGroup>
          </>
          ) : null;
        })()}

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
                  <EntityChip type="issue" />
                  <span className="text-muted-foreground ml-2 mr-2 font-mono text-xs">
                    {issue.identifier ?? issue.id.slice(0, 8)}
                  </span>
                  <span className="flex-1 truncate">
                    <HighlightMatch text={issue.title} query={searchQuery} />
                  </span>
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
                  <EntityChip type="agent" />
                  <span
                    className={cn(
                      "ml-2 h-1.5 w-1.5 rounded-full shrink-0",
                      agent.status === "active" || agent.status === "running"
                        ? "bg-emerald-500"
                        : agent.status === "paused"
                        ? "bg-amber-500"
                        : agent.status === "error"
                        ? "bg-destructive"
                        : "bg-muted-foreground/30",
                    )}
                  />
                  <span className="ml-2 flex-1 truncate">
                    <HighlightMatch text={agent.name} query={searchQuery} />
                  </span>
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
                  <EntityChip type="project" />
                  <span className="ml-2 flex-1 truncate">
                    <HighlightMatch text={project.name} query={searchQuery} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
