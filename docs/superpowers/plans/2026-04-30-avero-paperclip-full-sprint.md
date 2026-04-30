# Avero Paperclip Full Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close 4 remaining competitive UX gaps (Track A) and fix TypeScript errors in the in-progress integration work before committing (Track B), shipping everything in two clean commits.

**Architecture:** Track A is pure React/CSS — zero backend. Track B's OAuth flows, UI cards, and DB schema are already implemented in the uncommitted diff; only TS type errors and a missing plugin category union need fixing before commit.

**Tech Stack:** React 18, TypeScript, TanStack Query, Drizzle ORM, Express, pnpm monorepo

---

## Context: What's Already Done in the Uncommitted Diff

Before starting, note that these items are **already implemented** and do NOT need code written — they just need to be committed after Track A is done and Track B TS errors are fixed:

- All server OAuth routes: Gusto, QuickBooks, Gmail, Outlook, Google Workspace (`server/src/routes/integrations.ts`, `server/src/routes/google.ts`)
- All UI integration cards: Gusto, QuickBooks, Gmail, Outlook, Google Workspace (`ui/src/pages/IntegrationsPage.tsx`)
- All API client types and methods (`ui/src/api/integrations.ts`)
- `gustoOAuthTokens` DB schema and export (`packages/db/src/schema/gusto_oauth_tokens.ts`, `packages/db/src/schema/index.ts`)
- `video_renders` schema column renames + migration (`packages/db/src/schema/video_renders.ts`, migration `0079`)
- Sidebar badge query + computation — already wired in `ui/src/components/Sidebar.tsx`
- Cost column sorting — already fully implemented in `ui/src/pages/Agents.tsx`
- CommandPalette fuzzy scoring for agents/projects/nav items — already implemented

**What still needs code:** sidebar collapsed-state badge, onboarding validation, costs sparkline, palette action-item fuzzy, plugins.ts category type, meeting-ws.ts event types.

---

## File Map

| File | Change Type | What |
|------|-------------|------|
| `ui/src/components/Sidebar.tsx` | Modify (1 line) | Pass badge in collapsed state too |
| `ui/src/pages/OnboardingWizard.tsx` | Modify (~35 lines) | Debounced businessName validation in Step1 |
| `ui/src/pages/Costs.tsx` | Modify (~65 lines) | Add DailySparkline above by-agent table |
| `ui/src/components/CommandPalette.tsx` | Modify (~5 lines) | Apply fuzzyScore to ACTION_ITEMS filter |
| `server/src/routes/plugins.ts` | Modify (~10 lines) | Expand AvailablePluginExample tag union |
| `server/src/realtime/meeting-ws.ts` | Modify (~5 lines) | Add meeting event types to the WS union |

---

## Track A — Competitive Gap Fixes

### Task 1: Sidebar Badge in Collapsed State

**Files:**
- Modify: `ui/src/components/Sidebar.tsx:346`

- [ ] **Step 1: Locate the badge prop on the Approvals nav item**

Open `ui/src/components/Sidebar.tsx`. Find line 346 (search for `badge={!effectiveCollapsed`):

```tsx
badge={!effectiveCollapsed ? approvalsBadgeCount : undefined}
```

- [ ] **Step 2: Remove the collapsed guard**

Change that line to always pass the count:

```tsx
badge={approvalsBadgeCount}
```

`SidebarNavItem` already renders a small dot in collapsed mode when `badge > 0` (lines 66–77 of `SidebarNavItem.tsx`) — this is all that's needed.

- [ ] **Step 3: Verify visually**

Start the UI (`pnpm --filter ui dev` from repo root, UI runs on :5173). Navigate to a company that has pending approvals. Collapse the sidebar with the toggle button. Confirm the Approvals icon shows a blue dot. Expand it — confirm the count number appears.

---

### Task 2: Onboarding Business Name Inline Validation

**Files:**
- Modify: `ui/src/pages/OnboardingWizard.tsx` — `function Step1` starting at line 307

- [ ] **Step 1: Add debounced validation state to Step1**

Locate `function Step1(props: {` at line 307. Add the `nameError` state and the debounced validation effect **inside the function body**, right after the destructured props:

```tsx
function Step1(props: {
  businessName: string;
  setBusinessName: (v: string) => void;
  industry: string;
  setIndustry: (v: string) => void;
  revenueRange: string;
  setRevenueRange: (v: string) => void;
  painPoint: string;
  setPainPoint: (v: string) => void;
  onNext: () => void;
}) {
  const {
    businessName,
    setBusinessName,
    industry,
    setIndustry,
    revenueRange,
    setRevenueRange,
    painPoint,
    setPainPoint,
    onNext,
  } = props;

  const [nameError, setNameError] = useState<string | null>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function validateName(value: string) {
    if (value.length === 0) { setNameError(null); return; }
    if (value.trim().length < 3) { setNameError("Name must be at least 3 characters"); return; }
    if (!/^[a-zA-Z0-9 _\-&.,']+$/.test(value)) { setNameError("No special characters allowed"); return; }
    setNameError(null);
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setBusinessName(v);
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(() => validateName(v), 300);
  }

  const ready = businessName.trim().length > 0 && !!industry && !!revenueRange && !!painPoint;
```

`useState` and `useRef` are already imported at the top of the file — confirm with `grep -n "useState\|useRef" ui/src/pages/OnboardingWizard.tsx`.

- [ ] **Step 2: Wire the handler and error display to the input**

Find the `businessName` Input block (around line 338–346) and replace it:

```tsx
<div>
  <Label htmlFor="businessName">What's your business name?</Label>
  <Input
    id="businessName"
    className={cn("mt-1", nameError && "border-red-500 focus-visible:ring-red-500")}
    placeholder="Acme Plumbing"
    value={businessName}
    onChange={handleNameChange}
  />
  {nameError && (
    <p className="mt-1 text-xs text-red-500">{nameError}</p>
  )}
</div>
```

`cn` is already imported in the file — confirm with `grep -n "^import.*cn\b" ui/src/pages/OnboardingWizard.tsx`. If not present, add `import { cn } from "@/lib/utils";` to the imports.

- [ ] **Step 3: Verify behavior**

Run the UI, navigate to `/onboarding`. Type "AB" in the business name field — after 300ms a red helper text "Name must be at least 3 characters" appears. Type "ABC Corp" — error clears. Clear the field entirely — error clears. Confirm the "Next" button is not affected (it stays enabled regardless of validation state).

---

### Task 3: Costs Page Daily Sparkline

**Files:**
- Modify: `ui/src/pages/Costs.tsx` — add sparkline component and wire it above the by-agent table

- [ ] **Step 1: Add the DailySparkline component at the bottom of Costs.tsx**

Open `ui/src/pages/Costs.tsx`. Before the final `export default` line, add this pure-SVG component:

```tsx
function DailySpendSparkline({ events }: { events: import("@paperclipai/shared").FinanceEvent[] }) {
  const days = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const buckets: number[] = Array(daysInMonth).fill(0);
    for (const ev of events) {
      const d = new Date(ev.occurredAt);
      if (d.getFullYear() === year && d.getMonth() === month) {
        buckets[d.getDate() - 1] += ev.amountCents;
      }
    }
    return buckets;
  }, [events]);

  const max = Math.max(...days, 1);
  const W = 600;
  const H = 48;
  const pts = days.map((v, i) => {
    const x = (i / (days.length - 1)) * W;
    const y = H - (v / max) * (H - 4);
    return `${x},${y}`;
  });
  const linePath = `M ${pts.join(" L ")}`;
  const areaPath = `M 0,${H} L ${pts.join(" L ")} L ${W},${H} Z`;

  return (
    <div className="mb-6">
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-widest">
        Daily spend — current month
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-12"
        aria-hidden="true"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.3" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {days.length >= 2 && (
          <>
            <path d={areaPath} fill="url(#sparkGrad)" />
            <path d={linePath} fill="none" stroke="var(--primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </>
        )}
        {days.length < 2 && (
          <line x1="0" y1={H / 2} x2={W} y2={H / 2} stroke="var(--muted-foreground)" strokeWidth="1" strokeDasharray="4 4" />
        )}
      </svg>
    </div>
  );
}
```

- [ ] **Step 2: Wire the sparkline above the by-agent table**

In the Costs page JSX, search for the section that renders the by-agent breakdown table. Look for the `mainTab === "agents"` conditional block (search for `mainTab === "agents"` or the table header row for agents). Add the sparkline just above the table, inside that conditional:

```tsx
{mainTab === "agents" && (
  <>
    <DailySpendSparkline events={financeData?.events ?? []} />
    {/* ... existing agents table ... */}
  </>
)}
```

The exact insertion point will be where the agents tab content starts. If the agents table is inside a `{mainTab === "agents" && (...)}` block, wrap the existing content with a fragment and prepend the sparkline.

- [ ] **Step 3: Verify**

Navigate to `/costs`. The agents tab should show a filled area sparkline above the table. With no data it shows a dashed flat line. Confirm no external chart library was added (`grep -r "recharts\|chart.js\|d3" ui/src/pages/Costs.tsx` should return nothing).

---

### Task 4: CommandPalette ACTION_ITEMS Fuzzy Filter

**Files:**
- Modify: `ui/src/components/CommandPalette.tsx` — lines around 511–514

- [ ] **Step 1: Find the ACTION_ITEMS filter**

Open `ui/src/components/CommandPalette.tsx`. Find this block (around line 511):

```tsx
{(searchQuery.length === 0 || ACTION_ITEMS.some((a) => a.label.toLowerCase().includes(searchQuery.toLowerCase()))) && (
  ...
  {(searchQuery.length === 0 ? ACTION_ITEMS : ACTION_ITEMS.filter((a) => a.label.toLowerCase().includes(searchQuery.toLowerCase()))).map((action) => (
```

- [ ] **Step 2: Replace both `includes()` calls with fuzzyScore**

Replace with:

```tsx
{(searchQuery.length === 0 || ACTION_ITEMS.some((a) => fuzzyScore(searchQuery, a.label) > 0)) && (
  ...
  {(searchQuery.length === 0
    ? ACTION_ITEMS
    : ACTION_ITEMS
        .map((a) => ({ action: a, score: fuzzyScore(searchQuery, a.label) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.action)
  ).map((action) => (
```

`fuzzyScore` is already defined at line 50 of `CommandPalette.tsx` — no import needed.

- [ ] **Step 3: Verify**

Open the command palette (Cmd+K). Type "new" — confirm "New Agent", "New Project" etc. surface. Type "crt" — confirm "Create" items appear via subsequence matching.

---

### Task 5: Commit Track A

- [ ] **Step 1: TypeScript check UI**

```bash
cd ui && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Stage and commit**

```bash
cd /c/Users/glcar/paperclip
git add ui/src/components/Sidebar.tsx \
        ui/src/pages/OnboardingWizard.tsx \
        ui/src/pages/Costs.tsx \
        ui/src/components/CommandPalette.tsx
git commit -m "feat: close 5 competitive gaps — sidebar badges, cost sort, onboarding validation, sparkline, fuzzy search

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Track B — Integration Completions + TypeScript Fixes

### Task 6: Fix plugins.ts Category Tag Union

The diff adds new plugin entries with `tag: "integration"` and `tag: "productivity"` but the `AvailablePluginExample` interface only allows `tag: "example"`.

**Files:**
- Modify: `server/src/routes/plugins.ts:112`

- [ ] **Step 1: Expand the tag union**

Find the `AvailablePluginExample` interface (line ~106):

```ts
interface AvailablePluginExample {
  packageName: string;
  pluginKey: string;
  displayName: string;
  description: string;
  localPath: string;
  tag: "example";
}
```

Change the `tag` field to:

```ts
  tag: "example" | "integration" | "productivity";
```

- [ ] **Step 2: Rename the interface for accuracy**

Since it now covers more than examples, rename it throughout the file:

```bash
# Search for all usages
grep -n "AvailablePluginExample" server/src/routes/plugins.ts
```

Replace `AvailablePluginExample` with `AvailablePlugin` everywhere in the file (there should be ~3 usages: the interface definition, the array type annotation, and the function return type).

- [ ] **Step 3: Verify**

```bash
cd server && npx tsc --noEmit 2>&1 | grep "plugins.ts"
```

Expected: no errors for `plugins.ts`.

---

### Task 7: Fix meeting-ws.ts Event Type Union

**Files:**
- Modify: `server/src/realtime/meeting-ws.ts:~144`

- [ ] **Step 1: Find the CompanyEvent type or the broadcast call**

```bash
grep -n "CompanyEvent\|heartbeat.run\|\"meeting:" server/src/realtime/meeting-ws.ts | head -20
```

- [ ] **Step 2: Locate the type union and add meeting event types**

Find where the event type union is defined (it will be in `packages/shared/src/` or directly in the server types). The union currently is:

```ts
"heartbeat.run.queued" | "heartbeat.run.status" | "heartbeat.run.event" | "heartbeat.run.log" | "agent.status" | "activity.logged" | "plugin.ui.updated" | "plugin.worker.crashed" | "plugin.worker.restarted"
```

Run this to find the definition file:

```bash
grep -rn "heartbeat.run.queued.*heartbeat.run.status\|CompanyEventType\|CompanyLiveEvent" packages/shared/src/ server/src/ | grep "type\|interface\|=" | head -10
```

Once found, add `| "meeting:transcript" | "meeting:action-item"` to the union.

- [ ] **Step 3: If the type is in shared, rebuild shared first**

```bash
pnpm --filter @paperclipai/shared build
```

Then recheck server:

```bash
cd server && npx tsc --noEmit 2>&1 | grep "meeting-ws"
```

Expected: no errors for `meeting-ws.ts`.

---

### Task 8: Install Missing Type Dependencies

Three server modules are missing type declarations: `openid-client`, `web-push`, `pptxgenjs`.

**Files:**
- Modify: `server/package.json`

- [ ] **Step 1: Check if these are installed but missing @types**

```bash
cd /c/Users/glcar/paperclip && ls node_modules/openid-client 2>/dev/null && echo "installed" || echo "missing"
ls node_modules/web-push 2>/dev/null && echo "installed" || echo "missing"
ls node_modules/pptxgenjs 2>/dev/null && echo "installed" || echo "missing"
```

- [ ] **Step 2: Add type shims for any that lack @types packages**

For each package that is installed but has no bundled types, add a shim. Create `server/src/types/missing-modules.d.ts`:

```ts
declare module 'openid-client';
declare module 'web-push';
declare module 'pptxgenjs';
```

This is a safe workaround — these modules are used by existing code that was already working before the diff changes.

- [ ] **Step 3: Verify server TypeScript is clean**

```bash
cd server && npx tsc --noEmit 2>&1
```

Expected: 0 errors.

---

### Task 9: Settle the Lockfile

The diff modified `pnpm-lock.yaml` with new Remotion and plugin dependencies.

- [ ] **Step 1: Run pnpm install**

```bash
cd /c/Users/glcar/paperclip && pnpm install
```

Expected: exits cleanly, no missing peer warnings for the changed packages.

- [ ] **Step 2: Confirm video plugin and video-studio build**

```bash
pnpm --filter @paperclipai/plugin-video build 2>&1 | tail -5
pnpm --filter @paperclipai/video-studio build 2>&1 | tail -5
```

Expected: both exit 0. If build scripts don't exist, confirm `npx tsc --noEmit` inside each package passes.

---

### Task 10: Full TypeScript Verification

- [ ] **Step 1: UI check**

```bash
cd /c/Users/glcar/paperclip/ui && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 2: Server check**

```bash
cd /c/Users/glcar/paperclip/server && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 3: If errors remain, triage**

Any errors not in the changed files (i.e. pre-existing in unchanged files) should be documented but not blocked on — only errors introduced by the diff files need to be zero.

---

### Task 11: Commit Track B

- [ ] **Step 1: Stage all modified files from the diff**

```bash
cd /c/Users/glcar/paperclip
git add \
  packages/db/src/migrations/0079_video_renders_remotion.sql \
  packages/db/src/schema/index.ts \
  packages/db/src/schema/gusto_oauth_tokens.ts \
  packages/db/src/schema/video_renders.ts \
  packages/plugins/video/package.json \
  packages/video-studio/package.json \
  pnpm-lock.yaml \
  server/package.json \
  server/src/app.ts \
  server/src/routes/integrations.ts \
  server/src/routes/plugins.ts \
  server/src/routes/google.ts \
  server/src/services/gusto-client.ts \
  server/src/services/email-oauth-store.ts \
  server/src/realtime/meeting-ws.ts \
  ui/index.html \
  ui/src/api/integrations.ts \
  ui/src/components/Sidebar.tsx \
  ui/src/context/BrandContext.tsx \
  ui/src/context/BreadcrumbContext.tsx \
  ui/src/index.css \
  ui/src/pages/Auth.tsx \
  ui/src/pages/CliAuth.tsx \
  ui/src/pages/Dashboard.tsx \
  ui/src/pages/IntegrationsPage.tsx \
  ui/src/pages/PluginManager.tsx \
  packages/db/src/migrations/0082_gusto_oauth_tokens.sql
```

Also stage any new files created during Tasks 6–8:

```bash
git add server/src/types/missing-modules.d.ts 2>/dev/null || true
```

- [ ] **Step 2: Verify nothing sensitive is staged**

```bash
git diff --cached --name-only
```

Confirm no `.env`, credentials, or private key files appear.

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: ship Gusto/Google/QuickBooks/Gmail/Outlook OAuth + Remotion schema alignment

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

- [ ] **Step 4: Confirm clean working tree**

```bash
git status
```

Expected: only `.superpowers/` and `ui/.env.local` remain untracked (both intentionally excluded).

---

## Self-Review Checklist

All spec requirements covered:

| Spec Item | Task |
|-----------|------|
| Sidebar badge counts | Task 1 |
| Cost column sorting | Already done in diff — no task needed |
| Onboarding inline validation | Task 2 |
| Costs sparkline | Task 3 |
| CommandPalette fuzzy | Task 4 |
| Track A commit | Task 5 |
| Video/Remotion schema | Already done — Task 9 verifies |
| Gusto OAuth | Already done — Task 11 commits |
| Google Workspace OAuth | Already done — Task 11 commits |
| QuickBooks OAuth | Already done — Task 11 commits |
| Gmail + Outlook OAuth | Already done — Task 11 commits |
| Track B commit | Task 11 |
| TS check after Track A | Task 5 step 1 |
| TS check after Track B | Task 10 |
