# Paperclip 100/100 — Remaining Gaps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the two remaining gaps from the Paperclip 100/100 plan: pause button on agent run cards and pinned commands in the CommandPalette.

**Architecture:** Two isolated UI changes — one in `ActiveAgentsPanel.tsx` (add pause mutation + button), one in `CommandPalette.tsx` (add localStorage-persisted pinned commands with pin/unpin UI).

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, localStorage for persistence

---

## Context

Most of the Paperclip 100/100 plan is already implemented:
- Wave 1 (CSS tokens, fonts, radius): ✅ Complete
- Wave 2a (collapsible sidebar, CommandPalette recent history): ✅ Complete
- Wave 2b (WebSocket hook, dashboard wired): ✅ Complete
- Wave 2c (Onboarding step progress, AgentPreviewCard, Cmd+Enter hint): ✅ Complete
- Wave 3 (cancel/retry on run cards, cost display, bulk select, J/K/A/R): ✅ Mostly complete — **pause missing**
- Wave 4 (DensityToggle, KeyboardShortcutsCheatsheet): ✅ Complete

**Remaining gaps:**
1. Pause button on `AgentRunCard` — backend `/agents/:id/pause` exists, `agentsApi.pause()` exists, UI button missing
2. CommandPalette pinned commands — no pin functionality at all

---

## File Map

| File | Change |
|------|--------|
| `ui/src/components/ActiveAgentsPanel.tsx` | Add pause mutation + PauseCircle button next to cancel |
| `ui/src/components/CommandPalette.tsx` | Add pinned commands: localStorage persistence, pin/unpin UI, pinned group at top |

---

## Task 1: Pause button on AgentRunCard

**Files:**
- Modify: `ui/src/components/ActiveAgentsPanel.tsx`

Current state: `AgentRunCard` has cancel (StopCircle) for active runs and retry link (RotateCcw) for failed. No pause.

The pause button should:
- Show for active runs (queued or running) — same condition as cancel
- Call `agentsApi.pause(run.agentId, companyId)` via `useMutation`
- Show `PauseCircle` icon (Lucide)
- Be in the same action controls `div` as cancel, to the left of cancel
- Have same hover styling as cancel but amber (pause is recoverable, not destructive)
- Be hidden until hover (same `opacity-0 group-hover:opacity-100` pattern as cancel)

- [ ] **Step 1: Add PauseCircle to imports**

In `ui/src/components/ActiveAgentsPanel.tsx` line 11, add `PauseCircle` to the lucide-react import:

```tsx
import { ExternalLink, StopCircle, RotateCcw, PauseCircle } from "lucide-react";
```

- [ ] **Step 2: Add agentsApi import**

After line 8 (`import { issuesApi } from "../api/issues";`), add:

```tsx
import { agentsApi } from "../api/agents";
```

- [ ] **Step 3: Add pauseMutation inside AgentRunCard**

After the `cancelMutation` block (around line 172), add:

```tsx
const pauseMutation = useMutation({
  mutationFn: () => agentsApi.pause(run.agentId, companyId),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) });
  },
});

const handlePause = useCallback(
  (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    pauseMutation.mutate();
  },
  [pauseMutation],
);
```

- [ ] **Step 4: Add pause button to action controls div**

In the action controls `div` (around line 232), add the pause button before the cancel button (so order is: retry | pause | cancel | external-link):

```tsx
{isActive && (
  <button
    type="button"
    title="Pause agent"
    disabled={pauseMutation.isPending}
    onClick={handlePause}
    className={cn(
      "inline-flex h-7 w-7 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors",
      "hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-500",
      pauseMutation.isPending && "opacity-50 cursor-not-allowed",
    )}
  >
    <PauseCircle className="h-3.5 w-3.5" />
  </button>
)}
```

Place this immediately before the existing cancel button block.

- [ ] **Step 5: TypeScript check**

```bash
cd C:\Users\glcar\paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors (pre-existing errors in other files are acceptable — count only new ones in ActiveAgentsPanel.tsx)

- [ ] **Step 6: Commit**

```bash
cd C:\Users\glcar\paperclip
git add ui/src/components/ActiveAgentsPanel.tsx
git commit -m "feat: add pause button to agent run cards on dashboard

Adds PauseCircle hover-reveal button to AgentRunCard alongside existing
cancel/retry controls. Calls agentsApi.pause(agentId) and invalidates
live runs query on success. Amber hover tone (recoverable action)
vs red for cancel (destructive)."
```

---

## Task 2: Pinned commands in CommandPalette

**Files:**
- Modify: `ui/src/components/CommandPalette.tsx`

Current state: CommandPalette has recent history (last 5), Dashboard, Agents, Issues, Projects, Goals, Approvals, Quick Actions groups. No pinned commands.

Pinned commands should:
- Be stored in localStorage under key `avero:cmd:pinned` (array of command IDs)
- Appear as a "Pinned" group at the very top when at least 1 command is pinned
- Show a pin icon button on hover for each command item
- Clicking the pin icon toggles pinned state (pin = add to pinned, unpin = remove)
- Max 8 pinned commands
- Pinned commands show a filled Pin icon to indicate pinned state
- Pin button only shows on hover of a command item

The command type already has `id`, `label`, `path` fields from the existing recent commands implementation. We can use the same structure for pinned.

- [ ] **Step 1: Read CommandPalette.tsx to understand existing command shape**

Read `ui/src/components/CommandPalette.tsx` lines 1-80 to understand the command type and localStorage patterns already in use.

- [ ] **Step 2: Add Pin icon import and pinned storage key**

Find the existing import block and add `Pin, PinOff` to the lucide imports. Add storage constants near `RECENT_STORAGE_KEY`:

```tsx
const PINNED_STORAGE_KEY = "avero:cmd:pinned";
const MAX_PINNED = 8;
```

- [ ] **Step 3: Add usePinnedCommands hook (inline)**

After the `useRecentCommands` pattern (or wherever recent commands state is managed), add pinned state:

```tsx
const [pinned, setPinned] = useState<Array<{ id: string; label: string; path: string }>>(() => {
  try {
    return JSON.parse(localStorage.getItem(PINNED_STORAGE_KEY) ?? "[]");
  } catch {
    return [];
  }
});

const togglePin = useCallback((cmd: { id: string; label: string; path: string }) => {
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
```

- [ ] **Step 4: Add Pinned group at top of CommandList**

In the `<CommandList>` JSX, add a Pinned group as the first child (before the Recent group):

```tsx
{pinned.length > 0 && (
  <CommandGroup heading="Pinned">
    {pinned.map((cmd) => (
      <CommandItem
        key={`pinned-${cmd.id}`}
        value={`pinned-${cmd.id}`}
        onSelect={() => { navigate(cmd.path); addRecent(cmd); setOpen(false); }}
        className="group/item flex items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <Pin className="h-3 w-3 text-primary shrink-0" />
          {cmd.label}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); togglePin(cmd); }}
          className="opacity-0 group-hover/item:opacity-100 transition-opacity ml-auto p-0.5 text-muted-foreground hover:text-foreground"
          title="Unpin"
        >
          <PinOff className="h-3 w-3" />
        </button>
      </CommandItem>
    ))}
  </CommandGroup>
)}
```

- [ ] **Step 5: Add pin toggle button to all other command items**

For the Quick Actions group (and any other appropriate groups), add a pin button on hover. Find the `CommandItem` render pattern used for navigation items and wrap the label in a flex container with a pin button:

For each navigable `CommandItem` (agents, issues, projects, goals, quick actions), wrap the existing content in:

```tsx
<CommandItem
  key={item.id}
  value={...}
  onSelect={...}
  className="group/item flex items-center justify-between"
>
  <span className="flex items-center gap-2 min-w-0 flex-1">
    {/* existing icon + label content */}
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
```

Note: Read the actual CommandPalette code carefully before applying — the exact CommandItem structure may differ. Match the existing patterns exactly.

- [ ] **Step 6: TypeScript check**

```bash
cd C:\Users\glcar\paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors in CommandPalette.tsx

- [ ] **Step 7: Commit**

```bash
cd C:\Users\glcar\paperclip
git add ui/src/components/CommandPalette.tsx
git commit -m "feat: pinned commands in CommandPalette

Users can pin up to 8 frequently-used commands via hover pin button.
Pinned commands appear as first group in the palette, persisted to
localStorage (avero:cmd:pinned). PinOff button removes from pinned.
Pairs with existing recent commands (avero:cmd:recent)."
```

---

## Task 3: Final integration check

**Files:**
- Read: `ui/src/components/ActiveAgentsPanel.tsx`
- Read: `ui/src/components/CommandPalette.tsx`

- [ ] **Step 1: TypeScript full check**

```bash
cd C:\Users\glcar\paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | tail -5
```

Expected: No new errors in the two modified files.

- [ ] **Step 2: Verify no emoji characters introduced**

```bash
cd C:\Users\glcar\paperclip && grep -P "[\x{1F300}-\x{1F9FF}]" ui/src/components/ActiveAgentsPanel.tsx ui/src/components/CommandPalette.tsx
```

Expected: No output (no emoji).

- [ ] **Step 3: Verify Avero color tokens — no hardcoded colors outside spec**

```bash
cd C:\Users\glcar\paperclip && grep -E "#[0-9a-fA-F]{3,6}" ui/src/components/ActiveAgentsPanel.tsx ui/src/components/CommandPalette.tsx
```

Expected: Only `#2F80FF` (primary) if any — all others should use Tailwind semantic classes (`text-primary`, `text-muted-foreground`, `bg-destructive`, etc.)

- [ ] **Step 4: Commit plan doc**

```bash
cd C:\Users\glcar\paperclip
git add docs/superpowers/plans/2026-04-26-paperclip-100-gaps.md
git commit -m "docs: add Paperclip 100/100 gaps implementation plan"
```
