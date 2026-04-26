# Avero Enterprise — Deployment Guide

Production deployment infrastructure for Avero Enterprise running on the Paperclip monorepo.

## Prerequisites

- Docker Engine 24+ and Docker Compose v2 (`docker compose` — not `docker-compose`)
- `openssl` for self-signed certs, or `certbot` for Let's Encrypt
- A `.env` file at repo root with required variables (see below)

---

## Quick Start

```bash
# 1. Copy and populate environment file
cp .env.example .env
# Edit .env — fill in POSTGRES_PASSWORD, BETTER_AUTH_SECRET, and any API keys

# 2. Generate SSL certificate
bash scripts/setup-ssl.sh                          # self-signed (local dev)
bash scripts/setup-ssl.sh --domain your.domain.com # Let's Encrypt (production)

# 3. Make scripts executable
chmod +x scripts/avero-deploy.sh scripts/setup-ssl.sh

# 4. Start all services
docker compose -f docker-compose.avero.yml up -d

# 5. Verify
curl http://localhost:3100/api/health
```

---

## Files Created

| File | Purpose |
|------|---------|
| `Dockerfile.avero` | Multi-stage production image (node:20-alpine) |
| `.dockerignore.avero` | Build context exclusions |
| `docker-compose.avero.yml` | postgres + server + nginx orchestration |
| `nginx/nginx.conf` | TLS termination, rate limiting, WebSocket proxy, static caching |
| `nginx/certs/` | Mount point for TLS cert/key (not committed to git) |
| `scripts/avero-deploy.sh` | Zero-downtime rolling deployment |
| `scripts/setup-ssl.sh` | Self-signed or Let's Encrypt certificate provisioning |

> The repo's existing `Dockerfile` and `docker/docker-compose.yml` are the open-source
> self-hosted files and are left untouched. Avero Enterprise uses `Dockerfile.avero`
> and `docker-compose.avero.yml` exclusively.

---

## Environment Variables

Minimum required variables in `.env`:

```dotenv
# Required
POSTGRES_PASSWORD=<strong-random-password>
BETTER_AUTH_SECRET=<32+-char-random-string>

# Application public URL (used for OAuth callbacks etc.)
PAPERCLIP_PUBLIC_URL=https://your.domain.com

# AI provider keys (add whichever the deployment uses)
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
GOOGLE_API_KEY=

# Optional — Stripe billing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
```

Generate secrets:
```bash
openssl rand -base64 32   # use for POSTGRES_PASSWORD, BETTER_AUTH_SECRET
```

---

## Updating to a New Version

```bash
bash scripts/avero-deploy.sh
```

The script:
1. Pulls latest git changes
2. Builds a new Docker image
3. Runs database migrations (if `server/dist/scripts/migrate.js` exists)
4. Rolling-restarts the server container (nginx keeps serving during restart)
5. Health-checks until the new container is responsive
6. Re-confirms nginx is up

---

## Viewing Logs

```bash
# Follow server logs
docker compose -f docker-compose.avero.yml logs -f server

# Follow all services
docker compose -f docker-compose.avero.yml logs -f

# Last 100 lines of nginx
docker compose -f docker-compose.avero.yml logs --tail=100 nginx
```

---

## Backup

```bash
# Application data backup (if backup script exists in server dist)
docker compose -f docker-compose.avero.yml exec server \
    node server/dist/scripts/backup.js

# PostgreSQL dump
docker compose -f docker-compose.avero.yml exec postgres \
    pg_dump -U avero avero > "avero-backup-$(date +%Y%m%d-%H%M%S).sql"
```

---

## SSL Certificate Renewal (Let's Encrypt)

Add to host crontab (`crontab -e`):

```cron
0 3 * * * certbot renew --quiet && \
  docker compose -f /path/to/paperclip/docker-compose.avero.yml exec nginx nginx -s reload
```

---

## Service Architecture

```
Internet
   |
[Nginx :443]  ← TLS termination, rate limiting, gzip, cache headers
   |
[Server :3100]  ← Express/TypeScript app  (SERVE_UI=true serves React SPA)
   |
[Postgres :5432]  ← Internal network only (not exposed to host in production)
```

- `avero-public` network: nginx + server (internet-facing)
- `avero-internal` network: server + postgres (isolated, no external access)

---

## Troubleshooting

```bash
# Container status
docker compose -f docker-compose.avero.yml ps

# Rebuild from scratch
docker compose -f docker-compose.avero.yml down -v
docker compose -f docker-compose.avero.yml build --no-cache server
docker compose -f docker-compose.avero.yml up -d

# Shell into running server container
docker compose -f docker-compose.avero.yml exec server sh

# Test nginx config
docker compose -f docker-compose.avero.yml exec nginx nginx -t
```
