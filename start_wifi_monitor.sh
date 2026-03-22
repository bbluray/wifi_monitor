#!/bin/bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
mkdir -p "$LOG_DIR"

cd "$PROJECT_DIR"

export WIFI_MONITOR_PORT="${WIFI_MONITOR_PORT:-1503}"

echo "[wifi-monitor] starting backend..."
npm --prefix "$PROJECT_DIR/backend" run dev >>"$LOG_DIR/backend.log" 2>&1 &
BACKEND_PID=$!

echo "[wifi-monitor] starting frontend..."
npm --prefix "$PROJECT_DIR/frontend" run dev -- --host 0.0.0.0 --port 1504 >>"$LOG_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!

cleanup() {
  echo "[wifi-monitor] shutting down..."
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

wait -n "$BACKEND_PID" "$FRONTEND_PID"
STATUS=$?
exit $STATUS
