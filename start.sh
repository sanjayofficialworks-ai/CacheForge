#!/usr/bin/env bash
# Starts the CacheForge backend (Flask, :8000) and frontend (Node, :3000).
# The slot count can be set from the page; with none set, config.py decides.
# Press Ctrl+C to stop both.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT" || exit 1

API_PORT=8000
WEB_PORT=3000

# --- checks -----------------------------------------------------------------
if [ -x "$ROOT/venv/bin/python" ]; then
  PY="$ROOT/venv/bin/python"
elif command -v python3 >/dev/null 2>&1; then
  PY="python3"
else
  echo "Python not found. Create the virtualenv first: python3 -m venv venv && venv/bin/pip install flask" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js not found. Install it from https://nodejs.org, then run this script again." >&2
  exit 1
fi

if ! "$PY" -c "import flask" >/dev/null 2>&1; then
  echo "Flask is missing. Run: $PY -m pip install flask" >&2
  exit 1
fi

port_busy() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

for p in "$API_PORT" "$WEB_PORT"; do
  if port_busy "$p"; then
    echo "Port $p is already in use. Stop whatever is using it and try again." >&2
    exit 1
  fi
done

# --- start ------------------------------------------------------------------
LOG_DIR="$ROOT/.logs"
mkdir -p "$LOG_DIR"

NODE_PID=""
cleanup() {
  trap - INT TERM EXIT
  echo
  echo "Stopping CacheForge..."
  if [ -n "$NODE_PID" ]; then
    kill "$NODE_PID" 2>/dev/null   # serve.js also stops Flask
    wait "$NODE_PID" 2>/dev/null
  fi
  exit 0
}
trap cleanup INT TERM EXIT

# serve.js starts Flask itself (so the page can change the slot count) and
# serves the frontend. PY tells it which Python to use.
echo "Starting backend (Flask, port $API_PORT) and frontend (port $WEB_PORT)..."
PY="$PY" PORT="$WEB_PORT" API_PORT="$API_PORT" node frontend/serve.js >"$LOG_DIR/server.log" 2>&1 &
NODE_PID=$!

# --- wait until both answer -------------------------------------------------
ready=0
for _ in $(seq 1 40); do
  if curl -fs "http://127.0.0.1:$WEB_PORT/cache/health" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! kill -0 "$NODE_PID" 2>/dev/null; then
    echo "The server stopped while starting. Last log lines:" >&2
    tail -n 15 "$LOG_DIR/server.log" >&2
    exit 1
  fi
  sleep 0.5
done

if [ "$ready" -ne 1 ]; then
  echo "The servers did not become ready in 20 seconds. Log:" >&2
  tail -n 15 "$LOG_DIR/server.log" >&2
  exit 1
fi

echo
echo "CacheForge is running."
echo "  Open:     http://localhost:$WEB_PORT"
echo "  API:      http://localhost:$API_PORT/cache/health"
echo "  Log:      $LOG_DIR/server.log"
echo "Press Ctrl+C to stop."

# Open the browser if one is available (skip on headless machines).
if command -v xdg-open >/dev/null 2>&1 && [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  xdg-open "http://localhost:$WEB_PORT" >/dev/null 2>&1 &
fi

wait "$NODE_PID"
