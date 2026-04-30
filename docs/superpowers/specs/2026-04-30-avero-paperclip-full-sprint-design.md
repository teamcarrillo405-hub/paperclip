# Avero Paperclip — Full Sprint Design

**Date:** 2026-04-30  
**Status:** Approved  
**Commit strategy:** Two commits — Track A (UI gap fixes) then Track B (integrations + DB)

---

## Overview

Two-track sprint closing all remaining competitive gaps against Linear/Gemini Enterprise and completing all in-progress integration work sitting in the uncommitted diff.

---

## Track A — Competitive Gap Fixes

Zero backend changes. All client-side React/CSS. One commit on completion.

### 1. Sidebar Badge Counts

**File:** `ui/src/components/Sidebar.tsx`

Query `sidebarBadgesApi.get(companyId)` (endpoint already exists, queryKey already defined). Render a count pill on the Approvals nav item when `pendingCount > 0`. Pill disappears at zero — no visual noise when queue is empty. Use existing Electric Blue token for the pill background.

**Acceptance:** Approvals nav item shows live pending count; count updates when an approval is actioned without page reload.

---

### 2. Cost Column Sorting — Agents List

**File:** `ui/src/pages/Agents.tsx`

Add local state: `sortBy: 'cost' | 'name' | 'status' | null` and `sortDir: 'asc' | 'desc'`. Make the Cost column header a `<button>` that cycles `asc → desc → null`. Sort the agent array client-side using already-fetched cost data (`costByAgentId` map). Show a sort indicator chevron in the header.

**Acceptance:** Clicking Cost column header sorts agents by MTD spend descending; clicking again reverses; clicking a third time restores default order.

---

### 3. Onboarding Inline Validation

**File:** `ui/src/pages/OnboardingWizard.tsx`

On step 1, validate agent name `onChange` (debounced 300ms):
- Min 3 characters
- No special characters (regex: `/^[a-zA-Z0-9 _-]+$/`)

Show red underline on the input + helper text below when invalid. "Continue" button remains enabled — the helper text educates without hard-blocking. Clear validation state on blur if field is empty.

**Acceptance:** Typing a 2-char name shows inline error within 300ms; typing a valid name clears it; submitting with an invalid name shows the same inline error (no separate toast).

---

### 4. Costs Page Sparkline

**File:** `ui/src/pages/Costs.tsx`

Pure SVG area sparkline — no external chart library. Group `financeEvents` by calendar day for the current month. Normalize daily totals to 0–1 scale. Render as a filled SVG `<path>` using `d="M..."` constructed from the normalized points. Reuse the existing `DailySparkline` component pattern from `ActiveAgentsPanel.tsx`. Place above the by-agent breakdown table with a "Daily spend — current month" label.

**Acceptance:** Sparkline renders without external dependencies; updates when date range filter changes; gracefully renders a flat line when fewer than 2 data points exist.

---

### 5. CommandPalette Fuzzy Search

**File:** `ui/src/components/CommandPalette.tsx`

The 4-tier scorer (exact=100, prefix=90, substring=70, subsequence=0–50) already exists for navigation items. Extend it to agent and project entity results — replace the current `includes()` substring check with the scored filter. Items scoring 0 are excluded. Remaining results are sorted descending by score. Matched characters in result labels are **not** highlighted (out of scope — adds complexity for marginal gain).

**Acceptance:** Typing "DB" surfaces agents/projects with "database" in their name; typing "dash" surfaces the Dashboard nav item above unrelated items.

---

## Track B — Integration Completions

Backend routes + DB migrations + frontend UI cards. One commit on completion, after Track A is committed.

### 1. Video/Remotion Schema Alignment

**Files:** `packages/db/src/schema/index.ts`, `packages/db/src/migrations/0079_video_renders_remotion.sql`, `packages/plugins/video/package.json`, `packages/video-studio/package.json`, `pnpm-lock.yaml`

Migration `0079` is fully written. Wire it:
- Ensure renamed `video_renders` columns are reflected in the Drizzle schema file (`packages/db/src/schema/video_renders.ts`) and re-exported from `packages/db/src/schema/index.ts`
- Reconcile `video` and `video-studio` package.json deps (Remotion peer version alignment)
- Run `pnpm install` to settle lockfile

**Acceptance:** `pnpm -w tsc --noEmit` passes; migration runs idempotently on a fresh DB.

---

### 2. Gusto OAuth Full Flow

**Files:** `server/src/routes/integrations.ts`, `server/src/services/gusto-client.ts`, `ui/src/pages/IntegrationsPage.tsx`, `ui/src/api/integrations.ts`, `packages/db/src/schema/index.ts`

DB table and schema file are already written. Add `gustoOAuthTokens` export to `packages/db/src/schema/index.ts`. Wire the flow:

**Server:**
- `GET /integrations/gusto/connect` — builds Gusto OAuth authorization URL with `state` nonce, redirects
- `GET /integrations/gusto/callback` — exchanges code via `exchangeGustoCode`, fetches company info via `fetchGustoCurrentCompany`, stores tokens via `gustoOAuthStore.upsert`
- `GET /integrations/gusto/status` — returns `{ connected: boolean, companyName?: string }`
- `DELETE /integrations/gusto/disconnect` — deletes token row

**UI:**
- Gusto card in IntegrationsPage wired to `gustoStatusQuery`
- Connect button → redirects to `/integrations/gusto/connect`
- Connected state shows company name + Disconnect button

**Acceptance:** Full OAuth round-trip completes; token is stored; status endpoint reflects connected state; disconnect removes token.

---

### 3. Google Workspace OAuth

**Files:** `packages/plugins/google-workspace/src/`, `server/src/routes/integrations.ts`, `ui/src/pages/IntegrationsPage.tsx`, `ui/src/api/integrations.ts`

Pattern mirrors Gusto. Plugin manifest and worker are scaffolded.

**Server:**
- `GET /integrations/google/connect` — Google OAuth2 authorization URL (scopes: `email profile`)
- `GET /integrations/google/callback` — exchange code, store access + refresh tokens in company state store
- `GET /integrations/google/status` — returns `{ connected: boolean, email?: string }`
- `DELETE /integrations/google/disconnect` — clears stored tokens

**UI:**
- Google Workspace card in IntegrationsPage wired to `googleStatusQuery`
- Connected state shows connected email + Disconnect button

**Acceptance:** OAuth round-trip completes; status shows connected email; disconnect clears state.

---

### 4. QuickBooks Online OAuth2

**Files:** `server/src/routes/integrations.ts`, `ui/src/pages/IntegrationsPage.tsx`, `ui/src/api/integrations.ts`

Routes are partially written (authorize URL, token URL, state management). Complete the flow:

**Server:**
- State nonce already managed via `QB_AUTH_NAMESPACE` + `stateStore`
- `GET /integrations/quickbooks/connect` — builds Intuit authorization URL, stores pending state
- `GET /integrations/quickbooks/callback` — validates state, exchanges code at `QUICKBOOKS_TOKEN_URL`, stores tokens
- `GET /integrations/quickbooks/status` — returns `{ connected: boolean, companyName?: string }`
- `DELETE /integrations/quickbooks/disconnect` — revokes token at `QUICKBOOKS_REVOKE_URL`, clears state

**UI:**
- QuickBooks card in IntegrationsPage wired to status query
- Connect/disconnect pattern identical to Gusto

**Acceptance:** OAuth round-trip completes; token revocation hits Intuit revoke endpoint on disconnect.

---

### 5. Gmail + Outlook OAuth

**Files:** `server/src/routes/integrations.ts`, `server/src/services/email-oauth-store.ts` (new if not exists), `ui/src/pages/IntegrationsPage.tsx`, `ui/src/api/integrations.ts`

`emailOAuthStore` is scaffolded. Routes partially written.

**Server:**
- `GET /integrations/email/connect/:provider` (gmail | outlook) — builds provider-specific auth URL via `buildGmailAuthUrl` / `buildOutlookAuthUrl`
- `GET /integrations/email/callback` — detects provider from state, exchanges code, stores via `emailOAuthStore.upsert`
- `GET /integrations/email/status` — returns array of `{ provider, connected, email }` for company
- `DELETE /integrations/email/disconnect/:provider` — calls `emailOAuthStore.delete`

**UI:**
- Two separate cards in IntegrationsPage: Gmail and Outlook
- Each shows connected account email when connected, Connect button when not
- Both share the same status query (`emailStatusQuery`) returning the array

**Acceptance:** Both providers connect independently; disconnecting one does not affect the other; connected email is displayed on the card.

---

## Error Handling

- All OAuth callbacks validate `state` nonce — mismatches return `400 Bad Request`
- Token exchange failures return `502` with a user-facing message in the UI card ("Connection failed — please try again")
- DB failures on token upsert are caught and logged; user sees error toast
- All server routes are wrapped in existing `asyncHandler` pattern

## Testing

- TypeScript check: `pnpm -w tsc --noEmit` must pass after each track
- Manual smoke test: connect each integration, verify status endpoint, disconnect, verify status clears
- No automated E2E required for this sprint — integration OAuth flows require live credentials

---

## Commit Plan

**Commit 1 — Track A:**
```
feat: close 5 competitive gaps — sidebar badges, cost sort, onboarding validation, sparkline, fuzzy search
```

**Commit 2 — Track B:**
```
feat: ship Gusto/Google/QuickBooks/Gmail/Outlook OAuth + Remotion schema alignment
```
