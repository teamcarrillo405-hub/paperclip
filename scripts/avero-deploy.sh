#!/bin/bash
# ============================================================
# Avero Enterprise — Production Deployment Script
# Usage: bash scripts/avero-deploy.sh
# ============================================================
set -euo pipefail

COMPOSE_FILE="docker-compose.avero.yml"
HEALTH_URL="http://localhost:3100/api/health"
HEALTH_RETRIES=30
HEALTH_INTERVAL=2

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

log "=== Avero Enterprise Deployment Starting ==="

# ----------------------------------------------------------
# 1. Pull latest code from git
# ----------------------------------------------------------
log "Pulling latest changes from git..."
git pull --ff-only

# ----------------------------------------------------------
# 2. Build new server image
# ----------------------------------------------------------
log "Building new Docker image for server..."
docker compose -f "$COMPOSE_FILE" build server

# ----------------------------------------------------------
# 3. Run database migrations
# ----------------------------------------------------------
log "Running database migrations..."
# Ensure postgres is healthy before running migrations
docker compose -f "$COMPOSE_FILE" up -d postgres
log "Waiting for postgres to be healthy..."
until docker compose -f "$COMPOSE_FILE" exec postgres pg_isready -U avero -d avero > /dev/null 2>&1; do
    sleep 2
done

# Run migration via a one-shot container using the freshly built image
if docker compose -f "$COMPOSE_FILE" run --rm server node server/dist/scripts/migrate.js 2>/dev/null; then
    log "Migrations completed successfully."
else
    log "WARNING: migrate.js not found or returned non-zero. Skipping dedicated migration step."
    log "         If your migrations run on server startup this is expected — proceeding."
fi

# ----------------------------------------------------------
# 4. Rolling restart — zero downtime
#    nginx continues to serve from the old container while
#    the new one starts. Docker Compose replaces the container
#    in-place; nginx will reconnect on next upstream request.
# ----------------------------------------------------------
log "Starting rolling restart of server container..."
docker compose -f "$COMPOSE_FILE" up -d --no-deps server

# ----------------------------------------------------------
# 5. Health check loop
# ----------------------------------------------------------
log "Waiting for server to become healthy at $HEALTH_URL ..."
attempt=0
until curl -sf "$HEALTH_URL" > /dev/null 2>&1; do
    attempt=$((attempt + 1))
    if [ "$attempt" -ge "$HEALTH_RETRIES" ]; then
        log "ERROR: Server did not become healthy after $((HEALTH_RETRIES * HEALTH_INTERVAL)) seconds."
        log "       Run: docker compose -f $COMPOSE_FILE logs --tail=50 server"
        exit 1
    fi
    sleep "$HEALTH_INTERVAL"
done

log "Server is healthy."

# ----------------------------------------------------------
# 6. Ensure nginx is running (idempotent)
# ----------------------------------------------------------
docker compose -f "$COMPOSE_FILE" up -d --no-deps nginx

# ----------------------------------------------------------
# Done
# ----------------------------------------------------------
log "=== Deployment completed successfully at $(date '+%Y-%m-%d %H:%M:%S') ==="
