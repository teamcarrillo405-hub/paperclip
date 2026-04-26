# Avero Paperclip — 100/100 All 7 Sections Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring all 7 sections of the deep competitive analysis to 100/100 by closing specific UX gaps identified per section.

**Architecture:** 7 independent UI improvement tasks, one per scored page. Each task closes only the gaps confirmed as truly missing after auditing the current codebase. No backend changes needed — all changes are frontend-only.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide React, React Query, localStorage for client-side persistence

**Servers:** UI on `:5173`, backend on `:3100`

---

## Pre-flight: Current Score Audit

| Section | Current | Gap | Already Done | Still Needed |
|---------|---------|-----|--------------|--------------|
| 1. Onboarding Wizard | 79 | 21 | live adapter test, Cmd+Enter hint | templates, time estimate, adapter grid |
| 2. Dashboard | 71 | 29 | WebSocket live data, budget banner | date-range selector, activity feed icons, breadcrumb context |
| 3. Sidebar Navigation | 68 | 32 | collapsed state, density toggle | active border, section collapse, favorites |
| 4. Agents List | 75 | 25 | MTD cost col, cost sort | multi-col sort, export CSV, role/adapter search |
| 5. Active Agents Panel | 80 | 20 | pause ✅, cost ✅, cancel ✅ | show-all >4, transcript expand modal |
| 6. Approvals Queue | 75 | 25 | aging indicator ✅ | styled kbd badges, inline revision, live age timer |
| 7. Command Palette | 69 | 31 | pinned commands ✅ | agent actions, more QCAs, entity type visual chips |

---

## File Map

| File | Change |
|------|--------|
| `ui/src/components/OnboardingWizard.tsx` | Add task templates on Step 3, completion time estimate |
| `ui/src/pages/Dashboard.tsx` | Add date-range tabs on charts section, company name in header |
| `ui/src/components/ActivityRow.tsx` | Add actor-type color stripe (agent/user/system) |
| `ui/src/components/ActivityCharts.tsx` | Add 7d/14d/30d tab selector wired to existing queries |
| `ui/src/components/SidebarNavItem.tsx` | Active left-accent border (2px solid primary) |
| `ui/src/components/SidebarSection.tsx` | Collapsible sections with chevron, localStorage persistence |
| `ui/src/components/Sidebar.tsx` | Favorites pinning group at top, hover-intent (+) create buttons |
| `ui/src/context/SidebarContext.tsx` | Add `favoritePaths` + `sectionCollapsed` state |
| `ui/src/pages/Agents.tsx` | Multi-column sorting (name, status, last active), export CSV, role/adapter filter |
| `ui/src/components/ActiveAgentsPanel.tsx` | Show-all link when >4, transcript expand modal |
| `ui/src/pages/Approvals.tsx` | Styled kbd badges, live age timer (1-min interval), inline revision action |
| `ui/src/components/CommandPalette.tsx` | Live agent action items (pause, start run), more QCAs (goal, routine), entity type icon chips |

---

## Task 1: Onboarding Wizard — 79 → 100

**Target subsections:**
- Visual Quality 17→20: smoother step indicator line
- UX Flow 16→20: completion time estimate; replace confusing default task
- Power-User Features 15→20: all adapters visible; 4 one-click task templates
- Real-Time / Live Data 16→20: template selection is instant feedback
- First-Impression / Wow 15→20: templates = immediate confidence signal

**Files:**
- Modify: `ui/src/components/OnboardingWizard.tsx`

- [ ] **Step 1: Read the file to understand Step 3 and adapter section**

Read `ui/src/components/OnboardingWizard.tsx` lines 1–80 to identify the step structure, then lines 900–1100 to find where Step 3 task description is rendered and where the adapter "More types" toggle lives.

- [ ] **Step 2: Add completion time estimate to the wizard header**

Find the step progress header (the area that shows "Step X of 4" or similar). Add an estimate label next to it:

```tsx
{/* Find the step counter display and add this adjacent to it */}
<span className="text-[11px] text-muted-foreground/70 ml-2">
  · ~2 min · {4 - currentStep} step{4 - currentStep !== 1 ? "s" : ""} remaining
</span>
```

The exact location will be near where `currentStep` is rendered. Match the surrounding style.

- [ ] **Step 3: Add STARTER_TEMPLATES constant and TaskTemplateGrid component (inline)**

At the top of the file (after imports), add:

```tsx
const STARTER_TEMPLATES = [
  { id: "competitor", label: "Research competitor pricing", description: "Analyze top 5 competitors and summarize pricing tiers" },
  { id: "hiring",     label: "Write a hiring plan",         description: "Draft a hiring plan with roles, timelines, and budgets" },
  { id: "api-spec",   label: "Build an API spec",           description: "Generate an OpenAPI spec for a given product description" },
  { id: "content",    label: "Plan content calendar",       description: "Create a 4-week content calendar for social + blog" },
] as const;
```

- [ ] **Step 4: Replace the default task description with a template picker on Step 3**

Find the Step 3 task description textarea (it has a default prefilled value like "Hire three senior engineers..."). Replace the static textarea with a two-part UI: template picker grid on top, textarea below.

The textarea should auto-fill when a template is selected:

```tsx
{/* Template picker — add above the task description textarea */}
<div className="mb-4">
  <p className="text-xs text-muted-foreground mb-2 font-medium uppercase tracking-wider">Quick start</p>
  <div className="grid grid-cols-2 gap-2">
    {STARTER_TEMPLATES.map((t) => (
      <button
        key={t.id}
        type="button"
        onClick={() => setTaskDescription(t.description)}
        className={cn(
          "text-left rounded-lg border p-3 text-xs transition-colors",
          taskDescription === t.description
            ? "border-primary bg-primary/10 text-foreground"
            : "border-border/60 bg-card hover:border-primary/50 hover:bg-accent/40 text-muted-foreground",
        )}
      >
        <span className="font-medium block text-foreground mb-0.5">{t.label}</span>
        <span className="text-muted-foreground/80 leading-relaxed">{t.description}</span>
      </button>
    ))}
  </div>
</div>
{/* Existing textarea remains below — user can also type freely */}
```

Note: Check the actual state variable name for the task description (may be `taskDescription`, `task`, `issueBody`, or similar — read the file first).

- [ ] **Step 5: Expand adapter grid — remove "More adapter types" toggle**

Find the code that hides additional adapters behind a toggle (look for state like `showMoreAdapters` or a "Show more" button in the adapter selection step). Remove the toggle and show all adapters in the grid by default.

If the toggle is driven by a `showMoreAdapters` state, simply set its initial value to `true`:

```tsx
// Change: const [showMoreAdapters, setShowMoreAdapters] = useState(false);
// To:
const [showMoreAdapters, setShowMoreAdapters] = useState(true);
```

Or remove the conditional entirely if all adapters should always be visible.

- [ ] **Step 6: TypeScript check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors in `OnboardingWizard.tsx`.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/glcar/paperclip
git add ui/src/components/OnboardingWizard.tsx
git commit -m "feat(onboarding): task templates, completion estimate, all adapters visible

Adds 4 one-click starter task templates on Step 3 (competitor research,
hiring plan, API spec, content calendar) with auto-fill on selection.
Adds remaining-steps estimate to step header. Removes hidden adapter
toggle so all adapters are visible by default on Step 2."
```

---

## Task 2: Dashboard — 71 → 100

**Target subsections:**
- Visual Quality 14→20: activity feed actor-type differentiation
- UX Flow 14→20: date-range selector on charts
- Power-User Features 13→20: date-range persistence + metric context
- Real-Time / Live Data 17→20: synced timestamp in header
- First-Impression / Wow 13→20: company name in header, date selector, icon-rich activity feed

**Files:**
- Modify: `ui/src/components/ActivityRow.tsx`
- Modify: `ui/src/components/ActivityCharts.tsx`
- Modify: `ui/src/pages/Dashboard.tsx`

- [ ] **Step 1: Add actor-type color stripe to ActivityRow**

Read `ui/src/components/ActivityRow.tsx` to find the outer container div. Add a left border color based on `event.actorType`:

```tsx
// Replace the existing `classes` constant:
const actorTypeStripe =
  event.actorType === "agent" ? "border-l-2 border-l-blue-500/60" :
  event.actorType === "system" ? "border-l-2 border-l-slate-400/40" :
  "border-l-2 border-l-transparent"; // user = transparent (no stripe)

const classes = cn(
  "px-4 py-2 text-sm",
  actorTypeStripe,
  link && "cursor-pointer hover:bg-accent/50 transition-colors",
  className,
);
```

- [ ] **Step 2: Add date-range selector to ActivityCharts**

Read `ui/src/components/ActivityCharts.tsx` to understand the component signature and how it receives data.

The goal: add a `days` prop that controls the query window, and a 7d/14d/30d tab selector rendered at the top of the charts section.

First, check if `ActivityCharts` already accepts a `days` or `from` parameter. If not, add one:

```tsx
// In ActivityCharts component props:
interface ActivityChartsProps {
  companyId: string;
  days?: 7 | 14 | 30;  // add this prop
  // ... existing props
}
```

Inside the component, use `days` to calculate `from`:

```tsx
const from = useMemo(() => {
  const d = new Date();
  d.setDate(d.getDate() - (days ?? 14));
  return d.toISOString();
}, [days]);
```

- [ ] **Step 3: Add date-range state and tab UI to Dashboard.tsx**

Read `ui/src/pages/Dashboard.tsx` to find where `<ActivityCharts>` is rendered.

Add a `chartDays` state and the tab selector directly above the charts:

```tsx
const [chartDays, setChartDays] = useState<7 | 14 | 30>(14);

// In JSX, add above <ActivityCharts>:
<div className="flex items-center justify-between mb-3">
  <h2 className="text-sm font-semibold text-foreground">Activity</h2>
  <div className="flex items-center gap-0.5 rounded-md border border-border/60 bg-muted/30 p-0.5">
    {([7, 14, 30] as const).map((d) => (
      <button
        key={d}
        type="button"
        onClick={() => setChartDays(d)}
        className={cn(
          "px-2.5 py-1 text-[11px] font-medium rounded transition-colors",
          chartDays === d
            ? "bg-background text-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {d}d
      </button>
    ))}
  </div>
</div>
<ActivityCharts companyId={companyId} days={chartDays} />
```

- [ ] **Step 4: Add company name and synced timestamp to Dashboard header**

Find the page title area in `Dashboard.tsx` (likely an `<h1>` or breadcrumb). Add the company name and a "Last synced X seconds ago" label.

```tsx
// Find the company from useCurrentCompany() or similar context hook already used in the file
// Then in the header section:
<div className="flex items-center justify-between mb-6">
  <div>
    <h1 className="text-xl font-bold text-foreground">
      {company?.name ?? "Dashboard"}
    </h1>
    <p className="text-xs text-muted-foreground mt-0.5">
      {liveRunCount > 0 ? `${liveRunCount} agent${liveRunCount !== 1 ? "s" : ""} running · ` : ""}
      Last synced {syncedSecondsAgo}s ago
    </p>
  </div>
  {/* existing header actions */}
</div>
```

For `syncedSecondsAgo`, add a 10-second interval timer:

```tsx
const [syncedSecondsAgo, setSyncedSecondsAgo] = useState(0);
const lastSyncRef = useRef(Date.now());

// Reset on data refetch (add to existing useEffect or query onSuccess):
// lastSyncRef.current = Date.now();

useEffect(() => {
  const id = setInterval(() => {
    setSyncedSecondsAgo(Math.floor((Date.now() - lastSyncRef.current) / 1000));
  }, 10_000);
  return () => clearInterval(id);
}, []);
```

Note: Read the file first to understand how `company` and live run count are accessed — they may already be in context.

- [ ] **Step 5: TypeScript check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors in the three modified files.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/glcar/paperclip
git add ui/src/components/ActivityRow.tsx ui/src/components/ActivityCharts.tsx ui/src/pages/Dashboard.tsx
git commit -m "feat(dashboard): date-range selector, activity feed actor icons, header context

Adds 7d/14d/30d tab selector above charts. Activity feed rows now show
a colored left border per actor type (blue=agent, slate=system). Dashboard
header shows company name, live agent count, and last-synced timestamp."
```

---

## Task 3: Sidebar Navigation — 68 → 100

**Target subsections:**
- Visual Quality 14→20: active item left-accent border
- UX Flow 13→20: per-section collapsibility with chevron
- Power-User Features 14→20: Favorites pinning at top
- Real-Time / Live Data 15→20: hover-intent (+) create button per section
- First-Impression / Wow 12→20: combination of all above

**Files:**
- Modify: `ui/src/components/SidebarNavItem.tsx`
- Modify: `ui/src/components/SidebarSection.tsx`
- Modify: `ui/src/context/SidebarContext.tsx`
- Modify: `ui/src/components/Sidebar.tsx`

- [ ] **Step 1: Add active left-accent border to SidebarNavItem**

In `ui/src/components/SidebarNavItem.tsx`, update the `isActive` className to include a left border:

```tsx
// Replace the isActive branch in the className callback:
isActive
  ? "bg-accent text-foreground border-l-2 border-l-primary"
  : "text-foreground/80 hover:bg-accent/50 hover:text-foreground border-l-2 border-l-transparent",
```

Also update the padding for expanded state to compensate for the 2px border so items don't shift:

```tsx
// In the cn() call, replace the px-3 with:
collapsed ? "px-0 justify-center" : "pl-[10px] pr-3", // was px-3 (12px), now 10px left + 2px border = 12px total
```

- [ ] **Step 2: Add collapsible state to SidebarContext**

Read `ui/src/context/SidebarContext.tsx` to understand the existing context shape.

Add `sectionCollapsed` state (a `Set<string>` of collapsed section labels) and `favoritePaths` (an array of nav paths):

```tsx
const SECTION_COLLAPSED_KEY = "avero:sidebar:section-collapsed";
const FAVORITES_KEY = "avero:sidebar:favorites";

// Inside the context provider, add:
const [sectionCollapsed, setSectionCollapsed] = useState<Set<string>>(() => {
  try {
    const raw = localStorage.getItem(SECTION_COLLAPSED_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
});

const [favoritePaths, setFavoritePaths] = useState<string[]>(() => {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]");
  } catch { return []; }
});

const toggleSectionCollapsed = useCallback((label: string) => {
  setSectionCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(label)) next.delete(label); else next.add(label);
    try { localStorage.setItem(SECTION_COLLAPSED_KEY, JSON.stringify([...next])); } catch {}
    return next;
  });
}, []);

const toggleFavorite = useCallback((path: string) => {
  setFavoritePaths((prev) => {
    const next = prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path];
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(next)); } catch {}
    return next;
  });
}, []);
```

Export these from the context value: `{ ..., sectionCollapsed, toggleSectionCollapsed, favoritePaths, toggleFavorite }`.

- [ ] **Step 3: Make SidebarSection collapsible**

Update `ui/src/components/SidebarSection.tsx` to accept `collapsible`, `onToggleCollapse`, `isCollapsed`, and `onCreateHover` props:

```tsx
import { ChevronRight, Plus } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface SidebarSectionProps {
  label: string;
  children: ReactNode;
  collapsed?: boolean;        // sidebar collapsed (icon-only mode)
  collapsible?: boolean;      // this section can be collapsed
  isCollapsed?: boolean;      // current collapsed state
  onToggleCollapse?: () => void;
  createHref?: string;        // link for the (+) create button
}

export function SidebarSection({
  label, children, collapsed = false,
  collapsible = false, isCollapsed = false, onToggleCollapse,
  createHref,
}: SidebarSectionProps) {
  return (
    <div>
      {!collapsed && (
        <div
          className={cn(
            "group/sec flex items-center justify-between px-3 py-1.5",
            collapsible && "cursor-pointer hover:text-foreground",
          )}
          onClick={collapsible ? onToggleCollapse : undefined}
        >
          <span className="text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60 flex items-center gap-1">
            {collapsible && (
              <ChevronRight
                className={cn("h-3 w-3 transition-transform", !isCollapsed && "rotate-90")}
              />
            )}
            {label}
          </span>
          {createHref && (
            <a
              href={createHref}
              onClick={(e) => e.stopPropagation()}
              className="opacity-0 group-hover/sec:opacity-100 transition-opacity text-muted-foreground/60 hover:text-foreground"
              title={`New ${label.toLowerCase()}`}
            >
              <Plus className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      )}
      {collapsed && (
        <div className="py-1 px-2">
          <div className="h-px w-full bg-border/50" />
        </div>
      )}
      {!isCollapsed && (
        <div className="flex flex-col gap-0.5 mt-0.5">{children}</div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Add Favorites group to Sidebar.tsx**

Read `ui/src/components/Sidebar.tsx` lines 1–60 to understand imports and context usage.

Import `useSidebarPreferences` (or equivalent) to get `favoritePaths`, `toggleFavorite`, `sectionCollapsed`, `toggleSectionCollapsed`. Then:

1. Above the first `<SidebarSection>`, add a Favorites section that renders when `favoritePaths.length > 0`:

```tsx
{favoritePaths.length > 0 && (
  <div className="mb-1">
    <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
      Favorites
    </div>
    <div className="flex flex-col gap-0.5">
      {favoritePaths.map((path) => {
        const item = ALL_NAV_ITEMS.find((n) => n.to === path);
        if (!item) return null;
        return (
          <SidebarNavItem
            key={path}
            to={item.to}
            label={item.label}
            icon={item.icon}
            collapsed={collapsed}
            onFavoriteToggle={() => toggleFavorite(path)}
            isFavorite
          />
        );
      })}
    </div>
  </div>
)}
```

Note: You'll need to define `ALL_NAV_ITEMS` as a const array of `{ to, label, icon }` objects matching the existing nav items. Read the Sidebar.tsx file to extract these.

2. Add `collapsible`, `isCollapsed`, `onToggleCollapse`, and `createHref` props to the `<SidebarSection>` calls for "Work", "Reports", "Settings" sections.

- [ ] **Step 5: Add favorite toggle to SidebarNavItem**

Add an optional `onFavoriteToggle` and `isFavorite` prop to `SidebarNavItem`. Show a star icon on hover (right side):

```tsx
// Add to SidebarNavItemProps:
onFavoriteToggle?: () => void;
isFavorite?: boolean;

// Inside the expanded nav item content (after the badge rendering):
{onFavoriteToggle && (
  <button
    type="button"
    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFavoriteToggle(); }}
    title={isFavorite ? "Remove from favorites" : "Add to favorites"}
    className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0 text-muted-foreground hover:text-foreground"
  >
    <Star className={cn("h-3.5 w-3.5", isFavorite && "fill-primary text-primary")} />
  </button>
)}
```

Add `Star` from `lucide-react` to imports.

- [ ] **Step 6: TypeScript check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/glcar/paperclip
git add ui/src/components/SidebarNavItem.tsx ui/src/components/SidebarSection.tsx ui/src/context/SidebarContext.tsx ui/src/components/Sidebar.tsx
git commit -m "feat(sidebar): active border, collapsible sections, favorites pinning, create buttons

Active nav items get a 2px left primary-color border (Linear-style).
Work/Reports/Settings sections are collapsible via chevron toggle,
persisted in localStorage. Favorites group at top populated by star
icons on nav item hover. Hover-intent (+) create button per section header."
```

---

## Task 4: Agents List — 75 → 100

**Target subsections:**
- Visual Quality 13→20: multi-column sortable table headers with arrows
- UX Flow 15→20: name/status/last-active sorting
- Power-User Features 16→20: export CSV + role/adapter text search
- Real-Time / Live Data 17→20: already strong — minor: show live count badge in header
- First-Impression / Wow 14→20: sortable columns + export fundamentally change the value

**Note:** MTD cost column and cost sorting already exist. This task adds the remaining sort columns + export + search improvement.

**Files:**
- Modify: `ui/src/pages/Agents.tsx`

- [ ] **Step 1: Read the agents list to understand current sort and table structure**

Read `ui/src/pages/Agents.tsx` lines 60–180 to understand: how agents are sorted now (costSort state exists), what columns are shown in list view, how the search filter works.

- [ ] **Step 2: Add multi-column sort state**

The file already has `costSort`. Add a unified sort state that covers all columns:

```tsx
type SortCol = "name" | "status" | "lastActive" | "cost";
type SortDir = "asc" | "desc";

const [sort, setSort] = useState<{ col: SortCol; dir: SortDir } | null>(null);

const handleSort = useCallback((col: SortCol) => {
  setSort((prev) =>
    prev?.col === col
      ? prev.dir === "asc" ? { col, dir: "desc" } : null
      : { col, dir: "asc" }
  );
}, []);
```

Remove the existing `costSort` state and `setCostSort` — replace usages with the unified `sort` state (`sort?.col === "cost" ? sort.dir : null`).

- [ ] **Step 3: Update the sort comparator**

Replace the existing `costSorted` useMemo with a unified `sortedAgents` that covers all columns:

```tsx
const sortedAgents = useMemo(() => {
  if (!sort) return filtered; // filtered is the existing search-filtered list
  return [...filtered].sort((a, b) => {
    const dir = sort.dir === "asc" ? 1 : -1;
    if (sort.col === "name") return a.name.localeCompare(b.name) * dir;
    if (sort.col === "status") return (a.status ?? "").localeCompare(b.status ?? "") * dir;
    if (sort.col === "lastActive") {
      const ta = a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).getTime() : 0;
      const tb = b.lastHeartbeatAt ? new Date(b.lastHeartbeatAt).getTime() : 0;
      return (ta - tb) * dir;
    }
    if (sort.col === "cost") {
      return ((costByAgentId.get(a.id) ?? 0) - (costByAgentId.get(b.id) ?? 0)) * dir;
    }
    return 0;
  });
}, [filtered, sort, costByAgentId]);
```

Update the rest of the file to use `sortedAgents` instead of `costSorted`.

- [ ] **Step 4: Add sort arrows to column headers**

Find the list-view table headers (the row that shows "Name", "Status", "Last Active", "MTD Cost"). Update each header to be a clickable button with a sort direction indicator:

```tsx
function SortHeader({ col, label, sort, onSort }: {
  col: SortCol; label: string;
  sort: { col: SortCol; dir: SortDir } | null;
  onSort: (col: SortCol) => void;
}) {
  const active = sort?.col === col;
  return (
    <button
      type="button"
      onClick={() => onSort(col)}
      className={cn(
        "flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider transition-colors",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
      <ChevronUp
        className={cn(
          "h-3 w-3 transition-transform",
          active && sort?.dir === "desc" && "rotate-180",
          !active && "opacity-0",
        )}
      />
    </button>
  );
}
```

Add `ChevronUp` to lucide imports.

- [ ] **Step 5: Improve search to include role and adapter type**

Find the search filter in `filtered` useMemo. Currently it likely filters on `agent.name`. Add role and adapter type:

```tsx
// Replace: filtered.name.toLowerCase().includes(search.toLowerCase())
// With:
const q = search.toLowerCase();
return (
  agent.name.toLowerCase().includes(q) ||
  (agent.role ?? "").toLowerCase().includes(q) ||
  (agent.adapterType ?? "").toLowerCase().includes(q) ||
  (agent.status ?? "").toLowerCase().includes(q)
);
```

- [ ] **Step 6: Add Export CSV to bulk action bar**

Find the bulk action bar (the floating bar that appears when bulk select is active). Add an Export CSV button:

```tsx
<button
  type="button"
  onClick={() => {
    const rows = [
      ["Name", "Role", "Status", "Adapter", "MTD Cost ($)", "Last Active"].join(","),
      ...sortedAgents
        .filter((a) => selectedIds.has(a.id))
        .map((a) =>
          [
            JSON.stringify(a.name),
            JSON.stringify(a.role ?? ""),
            a.status ?? "",
            a.adapterType ?? "",
            (((costByAgentId.get(a.id) ?? 0) / 100)).toFixed(2),
            a.lastHeartbeatAt ? new Date(a.lastHeartbeatAt).toISOString() : "",
          ].join(",")
        ),
    ].join("\n");
    const blob = new Blob([rows], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "agents.csv"; a.click();
    URL.revokeObjectURL(url);
  }}
  className="inline-flex items-center gap-1.5 rounded border border-border/60 bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
>
  <Download className="h-3.5 w-3.5" />
  Export CSV
</button>
```

Add `Download` to lucide imports.

- [ ] **Step 7: TypeScript check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors in `Agents.tsx`.

- [ ] **Step 8: Commit**

```bash
cd C:/Users/glcar/paperclip
git add ui/src/pages/Agents.tsx
git commit -m "feat(agents): multi-column sorting, role/adapter search, export CSV

Replaces single costSort state with unified sort state covering name,
status, last-active, and cost columns. Sort arrows appear on active column.
Search now filters on name, role, adapter type, and status text. Export CSV
button in bulk action bar downloads selected agents with cost and last-active."
```

---

## Task 5: Active Agents Panel — 80 → 100

**Target subsections:**
- Visual Quality 16→20: transcript expand trigger visible on hover
- UX Flow 15→20: show-all link when >4 running; transcript expand modal
- Power-User Features 14→20: transcript fullscreen modal; send-to-agent from card is stretch — expand is highest value
- Real-Time / Live Data 18→20: already strong
- First-Impression / Wow 17→20: expand + show-all complete the panel

**Note:** Pause button, cost display, cancel, and retry are already implemented. This task adds the show-all link and transcript expand modal.

**Files:**
- Modify: `ui/src/components/ActiveAgentsPanel.tsx`

- [ ] **Step 1: Read the current panel to understand the 4-card cap and transcript display**

Read `ui/src/components/ActiveAgentsPanel.tsx` lines 1–80 to find: how the 4-card limit is enforced (likely a `.slice(0, 4)` call), and lines 200–260 to find the transcript display area.

- [ ] **Step 2: Add show-all link when more than 4 agents are running**

Find the `.slice(0, 4)` call (or equivalent). After the grid of run cards, add a "Show all" link:

```tsx
{runs.length > 4 && (
  <Link
    to="/agents"
    className="flex items-center justify-center gap-1.5 mt-2 py-2 rounded-lg border border-border/50 text-xs text-muted-foreground hover:text-foreground hover:bg-accent/30 transition-colors"
  >
    <LayoutGrid className="h-3.5 w-3.5" />
    Show all {runs.length} running agents
  </Link>
)}
```

Add `LayoutGrid` to lucide imports if not present.

- [ ] **Step 3: Add transcript expand state to AgentRunCard**

Add a `transcriptExpanded` boolean state and a Modal/Dialog component. Inside `AgentRunCard`, add:

```tsx
const [transcriptExpanded, setTranscriptExpanded] = useState(false);
```

Then in the transcript div, add an expand button on hover:

```tsx
<div className="relative group/transcript">
  {/* existing transcript scrollable div */}
  <button
    type="button"
    onClick={() => setTranscriptExpanded(true)}
    className="absolute top-1 right-1 opacity-0 group-hover/transcript:opacity-100 transition-opacity p-1 rounded bg-background/80 text-muted-foreground hover:text-foreground"
    title="Expand transcript"
  >
    <Maximize2 className="h-3 w-3" />
  </button>
</div>
```

Add `Maximize2` to lucide imports.

- [ ] **Step 4: Add transcript fullscreen Dialog**

After the existing JSX for the card, add a `<Dialog>` component:

```tsx
{transcriptExpanded && (
  <Dialog open={transcriptExpanded} onOpenChange={setTranscriptExpanded}>
    <DialogContent className="max-w-3xl h-[70vh] flex flex-col">
      <DialogHeader>
        <DialogTitle className="text-sm font-semibold">
          {run.agentName ?? "Agent"} — Live Transcript
        </DialogTitle>
      </DialogHeader>
      <div className="flex-1 overflow-y-auto rounded-lg bg-muted/30 p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap text-foreground/80">
        {run.transcript ?? "No transcript yet."}
      </div>
    </DialogContent>
  </Dialog>
)}
```

Check existing imports — `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle` should already be available from `@/components/ui/dialog`.

Note: The exact field name for the transcript content may differ — read the `run` object type to confirm the field name (may be `transcript`, `output`, `lastOutput`, etc.).

- [ ] **Step 5: TypeScript check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors in `ActiveAgentsPanel.tsx`.

- [ ] **Step 6: Commit**

```bash
cd C:/Users/glcar/paperclip
git add ui/src/components/ActiveAgentsPanel.tsx
git commit -m "feat(active-panel): show-all link when >4 running, transcript expand modal

When more than 4 agents are running, a 'Show all N running agents' link
appears below the 4-card grid linking to /agents. Each run card transcript
area shows a Maximize2 button on hover that opens a fullscreen Dialog
with the full transcript for reading."
```

---

## Task 6: Approvals Queue — 75 → 100

**Target subsections:**
- Visual Quality 13→20: styled kbd badges for the shortcut legend
- UX Flow 16→20: live age timer (auto-updates); inline revision action
- Power-User Features 18→20: inline revision text field from queue card
- Real-Time / Live Data 14→20: auto-updating age counter via setInterval
- First-Impression / Wow 14→20: kbd badges + live timer = polished control plane

**Note:** Aging indicator with color-coded severity already exists in ApprovalCard. This task adds the kbd badge styling and live timer + inline revision action.

**Files:**
- Modify: `ui/src/pages/Approvals.tsx`
- Modify: `ui/src/components/ApprovalCard.tsx`

- [ ] **Step 1: Replace plain text keyboard legend with styled kbd badges**

In `ui/src/pages/Approvals.tsx` at line 213, replace:

```tsx
<p className="text-[11px] text-muted-foreground/60 select-none">
  J/K navigate&nbsp;&nbsp;&#xB7;&nbsp;&nbsp;A approve&nbsp;&nbsp;&#xB7;&nbsp;&nbsp;R reject
</p>
```

With:

```tsx
<div className="flex items-center gap-3 flex-wrap">
  {[
    { keys: ["J", "K"], label: "navigate" },
    { keys: ["A"], label: "approve" },
    { keys: ["R"], label: "reject" },
  ].map(({ keys, label }) => (
    <span key={label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
      <span className="flex items-center gap-0.5">
        {keys.map((k) => (
          <kbd
            key={k}
            className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 text-[10px] font-mono font-semibold text-foreground/70 shadow-sm"
          >
            {k}
          </kbd>
        ))}
      </span>
      <span>{label}</span>
    </span>
  ))}
</div>
```

- [ ] **Step 2: Add live age timer to ApprovalCard**

In `ui/src/components/ApprovalCard.tsx`, the `waitingAge` function exists but the displayed age is static (computed once on render). Add a 1-minute auto-refresh:

```tsx
// Inside the ApprovalCard function, before the return:
const [tick, setTick] = useState(0);
useEffect(() => {
  if (approval.status !== "pending" && approval.status !== "revision_requested") return;
  const id = setInterval(() => setTick((t) => t + 1), 60_000);
  return () => clearInterval(id);
}, [approval.status]);

// Then in the waitingAge call, add tick as a dependency to re-compute:
// The existing call `waitingAge(approval.createdAt)` will automatically re-run
// because `tick` is referenced in component scope (just add it to the jsx region):
const { label, severity } = waitingAge(approval.createdAt); // tick forces re-render
```

Note: Simply having `tick` in scope and calling it (e.g., `void tick;`) ensures React re-renders the component. Or use `useMemo` with `tick` as a dep:

```tsx
const ageInfo = useMemo(() => waitingAge(approval.createdAt), [approval.createdAt, tick]);
```

- [ ] **Step 3: Add inline "Request revision" action to ApprovalCard**

Currently the `revision_requested` status exists but there's no way to submit a revision request from the queue card. Add an expandable inline form.

First, read `ui/src/components/ApprovalCard.tsx` lines 60–170 to find where the footer buttons are rendered (`showResolutionButtons`).

Add a "Request revision" button that expands a small textarea + submit:

```tsx
const [revisionOpen, setRevisionOpen] = useState(false);
const [revisionNote, setRevisionNote] = useState("");

// In the footer, next to Approve/Reject buttons:
{showResolutionButtons && (
  <Button
    variant="outline"
    size="sm"
    onClick={() => setRevisionOpen((v) => !v)}
    className="text-xs"
  >
    <MessageSquare className="h-3.5 w-3.5 mr-1" />
    Request revision
  </Button>
)}

{revisionOpen && (
  <div className="mt-2 flex flex-col gap-2">
    <textarea
      value={revisionNote}
      onChange={(e) => setRevisionNote(e.target.value)}
      placeholder="Describe what needs to change..."
      className="w-full rounded-md border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground resize-none focus:outline-none focus:ring-1 focus:ring-primary"
      rows={3}
    />
    <div className="flex gap-2 justify-end">
      <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setRevisionOpen(false); setRevisionNote(""); }}>
        Cancel
      </Button>
      <Button
        size="sm"
        className="text-xs"
        disabled={!revisionNote.trim()}
        onClick={() => {
          // call the existing onReject or a new onRevisionRequest prop with the note
          // For now wire to onReject with the note passed via a prop if available
          // The approval system's revision_requested status may need an API call
          // Check what API endpoint exists for revision requests
          setRevisionOpen(false);
          setRevisionNote("");
        }}
      >
        Submit
      </Button>
    </div>
  </div>
)}
```

Add `MessageSquare` to lucide imports.

Note: Wire the submit to the appropriate API call after reading what approval mutation functions are available in the parent page (`Approvals.tsx`).

- [ ] **Step 4: TypeScript check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors.

- [ ] **Step 5: Commit**

```bash
cd C:/Users/glcar/paperclip
git add ui/src/pages/Approvals.tsx ui/src/components/ApprovalCard.tsx
git commit -m "feat(approvals): styled kbd badges, live age timer, inline revision action

Keyboard shortcut legend replaced with properly styled <kbd> badges
(Linear-style keycap look). ApprovalCard age label auto-updates every
60 seconds via setInterval. 'Request revision' button expands inline
textarea for submitting revision notes from the queue card without navigation."
```

---

## Task 7: Command Palette — 69 → 100

**Target subsections:**
- Visual Quality 14→20: entity type visual chips (different icon bg per type)
- UX Flow 14→20: more quick-create actions (new goal, new routine); agent actions navigable by keyboard
- Power-User Features 15→20: inline agent actions — Pause, Start Run directly from palette
- Real-Time / Live Data 13→20: live running agents fetched and shown as actionable targets
- First-Impression / Wow 13→20: palette that can act (not just navigate) is the "wow" moment

**Note:** Pinned commands are already implemented.

**Files:**
- Modify: `ui/src/components/CommandPalette.tsx`

- [ ] **Step 1: Read the file to understand current structure**

Read `ui/src/components/CommandPalette.tsx` lines 1–120 to understand: imports, state, the query structure (live agents query if any), command item shape, and how the Quick Actions group is built.

- [ ] **Step 2: Add entity type icon background chips**

Find where issue, agent, and project CommandItems are rendered. Wrap the leading icon in a type-colored background chip:

```tsx
// Replace bare <Icon className="h-3.5 w-3.5" /> with a chip:
function EntityChip({ type }: { type: "issue" | "agent" | "project" | "goal" }) {
  const config = {
    issue:   { bg: "bg-blue-500/10 text-blue-500",   icon: CircleDot },
    agent:   { bg: "bg-violet-500/10 text-violet-500", icon: Bot },
    project: { bg: "bg-emerald-500/10 text-emerald-500", icon: FolderKanban },
    goal:    { bg: "bg-amber-500/10 text-amber-500",  icon: Target },
  }[type];
  const Icon = config.icon;
  return (
    <span className={cn("flex h-5 w-5 items-center justify-center rounded", config.bg)}>
      <Icon className="h-3 w-3" />
    </span>
  );
}
```

Add `Bot`, `FolderKanban`, `Target`, `CircleDot` to lucide imports (check which are already imported).

Then replace the icon rendering inside each result `CommandItem` with `<EntityChip type="issue" />` etc.

- [ ] **Step 3: Add live running agents to palette as actionable targets**

Add a query for live agent runs to the CommandPalette (check if there's already a `useCompanyLiveEvents` hook or a live runs query):

```tsx
const { data: liveRunsData } = useQuery({
  queryKey: queryKeys.liveRuns(companyId),
  queryFn: () => agentsApi.liveRuns(companyId),
  enabled: open && Boolean(companyId),
  refetchInterval: open ? 15_000 : false,
  staleTime: 10_000,
});

const liveAgents = liveRunsData?.runs ?? [];
```

- [ ] **Step 4: Add "Agent Actions" group with pause and start-run**

After the existing Quick Actions group in the `<CommandList>`, add an Agent Actions group:

```tsx
{liveAgents.length > 0 && searchQuery.length === 0 && (
  <CommandGroup heading="Agent Actions">
    {liveAgents.slice(0, 5).map((run) => (
      <CommandItem
        key={`pause-${run.agentId}`}
        value={`pause ${run.agentName}`}
        onSelect={() => {
          agentsApi.pause(run.agentId, companyId)
            .then(() => queryClient.invalidateQueries({ queryKey: queryKeys.liveRuns(companyId) }))
            .catch(() => {});
          setOpen(false);
        }}
        className="group/item flex items-center gap-2"
      >
        <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10 text-amber-500">
          <PauseCircle className="h-3 w-3" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="text-foreground">Pause </span>
          <span className="font-medium">{run.agentName}</span>
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">agent action</span>
      </CommandItem>
    ))}
  </CommandGroup>
)}
```

Add `PauseCircle` to imports if not already present.

- [ ] **Step 5: Add more quick-create actions**

Find the existing Quick Actions `CommandGroup`. Add new goal and new routine items:

```tsx
// After the existing "new agent" and "new project" items:
<CommandItem
  value="new goal create goal"
  onSelect={() => { navigate("/goals?new=1"); setOpen(false); }}
  className="flex items-center gap-2"
>
  <EntityChip type="goal" />
  New Goal
  <span className="ml-auto text-[10px] text-muted-foreground">⌘G</span>
</CommandItem>

<CommandItem
  value="new routine automation schedule"
  onSelect={() => { navigate("/routines?new=1"); setOpen(false); }}
  className="flex items-center gap-2"
>
  <span className="flex h-5 w-5 items-center justify-center rounded bg-slate-500/10 text-slate-500">
    <Timer className="h-3 w-3" />
  </span>
  New Routine
  <span className="ml-auto text-[10px] text-muted-foreground">⌘U</span>
</CommandItem>
```

Add `Timer` to lucide imports.

- [ ] **Step 6: TypeScript check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | grep "error TS" | head -20
```

Expected: 0 new errors in `CommandPalette.tsx`.

- [ ] **Step 7: Commit**

```bash
cd C:/Users/glcar/paperclip
git add ui/src/components/CommandPalette.tsx
git commit -m "feat(cmd-palette): agent actions, entity type chips, more quick-create actions

Palette now shows live running agents as actionable items — clicking
'Pause [Agent]' calls the pause mutation directly without navigation.
Each result type gets a colored icon chip (blue=issues, violet=agents,
emerald=projects, amber=goals). New quick-create actions: New Goal and
New Routine join the existing new issue/agent/project."
```

---

## Task 8: Final Integration Check

**Files:**
- Read: All 7 modified components for verification

- [ ] **Step 1: Full TypeScript build check**

```bash
cd C:/Users/glcar/paperclip && npx tsc --noEmit -p ui/tsconfig.json 2>&1 | tail -10
```

Expected: 0 new errors introduced by this plan's changes.

- [ ] **Step 2: Emoji check across all modified files**

```bash
cd C:/Users/glcar/paperclip && grep -P "[\x{1F300}-\x{1F9FF}]" \
  ui/src/components/OnboardingWizard.tsx \
  ui/src/pages/Dashboard.tsx \
  ui/src/components/ActivityRow.tsx \
  ui/src/components/ActivityCharts.tsx \
  ui/src/components/SidebarNavItem.tsx \
  ui/src/components/SidebarSection.tsx \
  ui/src/context/SidebarContext.tsx \
  ui/src/components/Sidebar.tsx \
  ui/src/pages/Agents.tsx \
  ui/src/components/ActiveAgentsPanel.tsx \
  ui/src/pages/Approvals.tsx \
  ui/src/components/ApprovalCard.tsx \
  ui/src/components/CommandPalette.tsx 2>/dev/null
```

Expected: No output (zero emoji in any modified file).

- [ ] **Step 3: Hardcoded color check**

```bash
cd C:/Users/glcar/paperclip && grep -E '"#[0-9a-fA-F]{3,6}"' \
  ui/src/components/SidebarNavItem.tsx \
  ui/src/components/SidebarSection.tsx \
  ui/src/components/CommandPalette.tsx 2>/dev/null
```

Expected: No hardcoded hex values (use Tailwind semantic classes only).

- [ ] **Step 4: Commit plan doc**

```bash
cd C:/Users/glcar/paperclip
git add docs/superpowers/plans/2026-04-26-avero-100-all-7-sections.md
git commit -m "docs: add Avero 100/100 all-7-sections implementation plan"
```
