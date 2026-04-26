#!/bin/bash
set -euo pipefail

PID_FILE="/tmp/avero-server.pid"
WAIT_SECS=30

trap 'echo "Interrupted — restart aborted"; exit 130' SIGINT

# Resolve the PID to signal
find_pid() {
  if [[ -f "$PID_FILE" ]]; then
    local pid
    pid=$(cat "$PID_FILE")
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      echo "$pid"
      return
    fi
  fi
  # Fallback: find by process name
  pgrep -f "paperclip.*server" 2>/dev/null | head -1 || true
}

TARGET_PID=$(find_pid)

if [[ -z "$TARGET_PID" ]]; then
  echo "No running server process found — starting fresh."
else
  echo "Sending SIGTERM to PID $TARGET_PID..."
  kill -TERM "$TARGET_PID"

  elapsed=0
  while kill -0 "$TARGET_PID" 2>/dev/null; do
    if [[ $elapsed -ge $WAIT_SECS ]]; then
      echo "Process $TARGET_PID did not exit after ${WAIT_SECS}s — sending SIGKILL."
      kill -KILL "$TARGET_PID" 2>/dev/null || true
      break
    fi
    sleep 1
    (( elapsed++ )) || true
  done

  echo "Process $TARGET_PID stopped after ${elapsed}s."
fi

# Remove stale PID file
rm -f "$PID_FILE"

# Start new server process
echo "Starting new server..."
exec "${SERVER_CMD:-node dist/server/src/index.js}"
