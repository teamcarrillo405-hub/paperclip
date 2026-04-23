# Avero AI — Developer Guide

This guide covers everything you need to build, extend, and deploy Avero AI
(white-labeled from `paperclipai/paperclip`). It is the canonical reference for
contributors, AI assistants (Cline, Claude), and integrators.

---

## 1. Project Setup

### Prerequisites

- Node.js 20.x (check `.nvmrc` if present)
- pnpm 9.x (`npm i -g pnpm`)
- PostgreSQL 15+ (local or containerized)
- Docker (optional, recommended for local DB)
- VS Code + Cline extension (optional, recommended)

### Clone & install

```bash
git clone https://github.com/paperclipai/paperclip.git
cd paperclip
pnpm install
```

### Environment setup

```bash
cp .env.example .env
# edit .env — at minimum set DATABASE_URL and ANTHROPIC_API_KEY
```

Flip dev features on locally:

```
VITE_DEV_MODE=true
```

This reveals the **Dev Tools** page at `/dev-tools` and the `/api/dev/*`
endpoints.

### Database setup

```bash
# spin up local postgres
docker compose -f docker/compose.dev.yml up -d postgres

# run migrations
pnpm --filter @paperclipai/db migrate
```

### Run the stack

```bash
pnpm dev   # runs server + ui concurrently
```

- Server API: `http://localhost:3000/api`
- UI: `http://localhost:5173`

---

## 2. Architecture Overview

```
paperclip/
├── apps/              # standalone apps (CLI wrappers, etc.)
├── cli/               # paperclip CLI binary
├── packages/
│   ├── db/            # Drizzle schemas + migrations
│   ├── shared/        # cross-package types + validators
│   ├── adapters/      # LLM adapter registry (claude_local only)
│   ├── plugins/
│   │   ├── quickbooks/   # reference plugin
│   │   ├── email/
│   │   ├── aider/
│   │   ├── n8n/
│   │   └── …             # one dir per integration
│   ├── chat-widget/
│   ├── mcp-server/
│   └── sdk/
├── server/            # Express API (entry: src/app.ts)
├── ui/                # Vite + React frontend (entry: src/main.tsx)
├── docs/              # documentation (this file lives here)
├── tests/             # cross-package integration tests
└── whitelabel.config.ts  # branding source of truth
```

Package relationships (ASCII):

```
           ┌──────────────┐
           │      ui      │  React + Vite
           └──────┬───────┘
                  │ /api/*
           ┌──────▼───────┐
           │    server    │  Express
           └──┬────────┬──┘
              │        │
    ┌─────────▼┐   ┌───▼────────────┐
    │packages/ │   │packages/plugins│
    │   db     │   │ (one per tool) │
    └─────┬────┘   └────────────────┘
          │
     PostgreSQL
```

---

## 3. Plugin Development Guide

Plugins add new capabilities (tools, background jobs, UI panels). They live
under `packages/plugins/<name>/` and always follow the QuickBooks pattern.

### Step 1 — Scaffold the package

```bash
mkdir -p packages/plugins/myfeature/src
```

Create `packages/plugins/myfeature/package.json`:

```json
{
  "name": "@paperclipai/plugin-myfeature",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -b"
  },
  "dependencies": {
    "@paperclipai/db": "workspace:*",
    "@paperclipai/shared": "workspace:*"
  }
}
```

### Step 2 — Export tools from `src/index.ts`

```ts
import type { AgentTool } from "@paperclipai/shared";

export const myFeatureTools: AgentTool[] = [
  {
    name: "myfeature_run",
    description: "Run my feature",
    inputSchema: { type: "object", properties: { input: { type: "string" } } },
    async execute({ companyId, args }) {
      return { ok: true, companyId, echoed: args.input };
    },
  },
];
```

### Step 3 — Add a DB schema (if needed)

Create `packages/db/src/schema/myfeature.ts`:

```ts
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

export const myfeatureRuns = pgTable("myfeature_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  companyId: uuid("company_id").notNull(),
  status: text("status").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
```

Re-export from `packages/db/src/schema/index.ts`:

```ts
export { myfeatureRuns } from "./myfeature.js";
```

### Step 4 — Create a migration

```bash
pnpm --filter @paperclipai/db drizzle-kit generate:pg
# then rename the generated 00XX_*.sql to match your next number
```

Current highest migration number: check
`packages/db/src/migrations/` — take the highest + 1.

### Step 5 — Register with the server

Add to `server/src/plugins/index.ts`:

```ts
import { myFeatureTools } from "@paperclipai/plugin-myfeature";

export const allPluginTools = [
  ...quickbooksTools,
  ...myFeatureTools,
];
```

---

## 4. Database Guide

### Creating a schema

- One file per table under `packages/db/src/schema/<entity>.ts`.
- UUID primary keys via `uuid().primaryKey().defaultRandom()`.
- Always include `createdAt: timestamp().notNull().defaultNow()`.
- Key company-scoped rows by `companyId: uuid("company_id").notNull()`.

### Generating & running migrations

```bash
# generate SQL from schema diff
pnpm --filter @paperclipai/db drizzle-kit generate:pg

# apply migrations
pnpm --filter @paperclipai/db migrate
```

Migrations live in `packages/db/src/migrations/` — numbered monotonically.
Never delete an applied migration; write a new one to change history.

---

## 5. UI Development Guide

### Create a page

1. Add `ui/src/pages/MyFeaturePage.tsx`:

   ```tsx
   export function MyFeaturePage() {
     return <div className="p-6">Hello</div>;
   }
   ```

2. Register the route in `ui/src/App.tsx`:

   ```tsx
   import { MyFeaturePage } from "./pages/MyFeaturePage";
   // inside <Routes>:
   <Route path="myfeature" element={<MyFeaturePage />} />
   ```

3. Add a sidebar entry in `ui/src/components/Sidebar.tsx`:

   ```tsx
   <SidebarNavItem to="/myfeature" label="My Feature" icon={Zap} />
   ```

### Styling conventions

- Tailwind utility classes. Theme tokens via CSS variables in `index.css`.
- Brand colors: primary `#2563eb`, accent `#16a34a`.
- Icons: `lucide-react`.
- Use components under `@/components/ui/*` (shadcn-style) whenever possible.

---

## 6. The 20 Features

| # | Feature | Plugin Package | UI Page | Key Env Vars |
|---|---|---|---|---|
| 1 | QuickBooks | `@paperclipai/plugin-quickbooks` | `/integrations` | `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` |
| 2 | Email | `@paperclipai/plugin-email` | `/email` | `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` |
| 3 | Voice / SMS | `@paperclipai/plugin-voice` | `/customers` | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` |
| 4 | Social Media | `@paperclipai/plugin-social` | `/social` | `TWITTER_API_KEY`, `LINKEDIN_CLIENT_ID` |
| 5 | Marketing | — | `/marketing` | — |
| 6 | Customer 360 | `@paperclipai/plugin-customer360` | `/customers` | — |
| 7 | AI Crews (CrewAI) | `@paperclipai/plugin-crewai` | `/crews` | `CREWAI_ENABLED` |
| 8 | Knowledge Base | `@paperclipai/plugin-knowledge-base` | `/knowledge` | `KB_STORAGE_DIR` |
| 9 | Aider (AI Coder) | `@paperclipai/plugin-aider` | `/aider` | `AIDER_ENABLED` |
| 10 | Goose (AI Coder) | `@paperclipai/plugin-goose` | — | `GOOSE_ENABLED` |
| 11 | n8n Automations | `@paperclipai/plugin-n8n` | `/automations` | `N8N_URL`, `N8N_API_KEY` |
| 12 | Postal Email Server | `@paperclipai/plugin-postal` | — | `POSTAL_API_URL`, `POSTAL_API_KEY` |
| 13 | Chat Widget | `@paperclipai/chat-widget` | `/chat-widget` | `CHAT_WIDGET_ENABLED` |
| 14 | Guardian (Compliance) | — | `/compliance` | `GUARDIAN_ENABLED` |
| 15 | Reseller Program | — | `/partner` | `RESELLER_ENABLED` |
| 16 | Billing (Stripe) | — | `/billing` | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| 17 | Mobile Push | — | — | `FCM_SERVER_KEY` |
| 18 | Video Studio (Remotion) | `@paperclipai/plugin-video` | `/video-studio` | `REMOTION_ENABLED` |
| 19 | Onboarding Wizard | — | `/onboarding` | — |
| 20 | Cline Dev Productivity | — | `/dev-tools` | `VITE_DEV_MODE` |

---

## 7. Environment Variables Reference

| Variable | Required | Used By | Description |
|---|---|---|---|
| `DATABASE_URL` | yes | db | PostgreSQL connection string |
| `ANTHROPIC_API_KEY` | yes | server, claude_local adapter | Anthropic API key |
| `OPENAI_API_KEY` | optional | server | Fallback LLM |
| `SMTP_HOST` | optional | plugin-email | Outbound SMTP |
| `SMTP_USER` | optional | plugin-email | SMTP auth |
| `SMTP_PASS` | optional | plugin-email | SMTP auth |
| `TWILIO_ACCOUNT_SID` | optional | plugin-voice | Twilio |
| `TWILIO_AUTH_TOKEN` | optional | plugin-voice | Twilio |
| `QUICKBOOKS_CLIENT_ID` | optional | plugin-quickbooks | OAuth |
| `QUICKBOOKS_CLIENT_SECRET` | optional | plugin-quickbooks | OAuth |
| `N8N_URL` | optional | plugin-n8n | n8n instance URL |
| `N8N_API_KEY` | optional | plugin-n8n | n8n auth |
| `POSTAL_API_URL` | optional | plugin-postal | Postal API endpoint |
| `POSTAL_API_KEY` | optional | plugin-postal | Postal auth |
| `STRIPE_SECRET_KEY` | optional | server | Billing |
| `STRIPE_WEBHOOK_SECRET` | optional | server | Stripe webhook signing |
| `AWS_ACCESS_KEY_ID` | optional | storage | S3 storage |
| `AWS_SECRET_ACCESS_KEY` | optional | storage | S3 storage |
| `FCM_SERVER_KEY` | optional | mobile | Firebase push |
| `GITHUB_TOKEN` | optional | aider | GH repo access |
| `SLACK_BOT_TOKEN` | optional | notifications | Slack integration |
| `AIDER_ENABLED` | flag | plugin-aider | Enables Aider UI/routes |
| `GOOSE_ENABLED` | flag | plugin-goose | Enables Goose |
| `CREWAI_ENABLED` | flag | plugin-crewai | Enables CrewAI |
| `GUARDIAN_ENABLED` | flag | guardian | Enables Guardian compliance |
| `CHAT_WIDGET_ENABLED` | flag | chat-widget | Enables embeddable widget |
| `RESELLER_ENABLED` | flag | reseller | Partner portal |
| `REMOTION_ENABLED` | flag | plugin-video | Video rendering |
| `KB_STORAGE_DIR` | optional | plugin-knowledge-base | Local KB storage path |
| `VITE_DEV_MODE` | flag | ui + server | Shows Dev Tools page + /api/dev/* |

---

## 8. Cline / AI Assistant Usage

This repo ships with a `.clinerules` file at the root. Cline reads it
automatically and uses it as the project's coding contract.

### Recommended workflow

1. Install the **Cline** VS Code extension
   (`saoudrizwan.claude-dev` — included in `.vscode/extensions.json`).
2. Open the repo; `.vscode/settings.json` wires Cline to Anthropic with
   `customInstructions` pointing at `.clinerules`.
3. Start tasks with a short, outcome-oriented prompt. Cline will pull context
   from `.clinerules`, the surrounding files, and recent diffs.

### Tips for AI-assisted development

- Reference the plugin pattern (`packages/plugins/quickbooks/`) and the
  schema pattern (`packages/db/src/schema/billing_subscriptions.ts`) when
  generating new code — both are explicit in `.clinerules`.
- Ask the assistant to run `npx tsc --noEmit` before committing — this is
  also exposed as a button on the **Dev Tools** page.
- When the assistant proposes a new adapter, verify the `type` is
  `claude_local` (never `claude-code` or `claude_code`).
- Use the Dev Tools **Environment Check** section to see which integrations
  are configured locally before asking the assistant to build against them.

---

## 9. Deployment Guide

### Docker build

```bash
docker build -t averoai:latest .
docker run --env-file .env.production -p 3000:3000 averoai:latest
```

### Production environment checklist

- [ ] `DATABASE_URL` points at a managed Postgres
- [ ] `ANTHROPIC_API_KEY` set with production-tier billing
- [ ] `VITE_DEV_MODE=false` (never expose Dev Tools in prod)
- [ ] TLS terminator in front of the container (Caddy, Traefik, ALB)
- [ ] Backups for Postgres running nightly
- [ ] `STRIPE_WEBHOOK_SECRET` matches the configured Stripe endpoint
- [ ] All required env vars from §7 set for enabled integrations

### Migrations on deploy

The server auto-runs pending migrations on startup when
`RUN_MIGRATIONS_ON_START=true`. For multi-instance deploys, run migrations
once from a single job before rolling new instances.

---

## 10. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `ECONNREFUSED` on startup | Postgres not reachable | Check `DATABASE_URL`; verify container/service is up |
| `401` on every API call | Missing session / bad auth header | Re-login from UI; confirm `authReady` is true in server logs |
| Dev Tools page 404s | `VITE_DEV_MODE` unset or `false` | Set `VITE_DEV_MODE=true` in `.env` and restart both server and Vite |
| `/api/dev/*` returns 404 | Same as above, server-side | Restart the server after flipping the flag |
| Typecheck fails with unrelated errors | Pre-existing issues | Only fix errors you introduce; pre-existing ones are tracked separately |
| Migration number conflict | Two branches picked the same number | Rebase, renumber your migration to `max+1` |
| Adapter rejects config | Wrong `type` field | Must be `claude_local` — never `claude-code` or `claude_code` |
| `pnpm install` fails | Stale `node_modules` | `rm -rf node_modules && pnpm install` |
| UI hot-reload hangs | Vite HMR port collision | Change `serverPort` in dev config; HMR uses `serverPort + 10000` |

---

## Further reading

- `AGENTS.md` — how autonomous agents operate in the repo
- `adapter-plugin.md` — adapter & plugin contracts
- `.clinerules` — Cline-specific coding rules (source of truth)
- `whitelabel.config.ts` — branding
