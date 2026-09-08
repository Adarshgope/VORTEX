#!/usr/bin/env bash
#
# VORTEX — start the Flask API (with the ML freight models loaded) and the Vite
# dev server together.
#
#   ./start_dev.sh              # backend on 5050 (or the next free port), UI on 5173
#   PORT=5060 ./start_dev.sh    # pin the backend port
#   ./start_dev.sh --backend    # backend only
#   ./start_dev.sh --frontend   # frontend only (proxies /api to VITE_API_URL, default :5050)
#
# Ctrl-C stops both.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
ML_SOURCE="${ML_SOURCE:-$(cd "$ROOT/.." && pwd)/ML}"
VENV="$BACKEND/.venv"

RUN_BACKEND=1
RUN_FRONTEND=1
case "${1:-}" in
  --backend)  RUN_FRONTEND=0 ;;
  --frontend) RUN_BACKEND=0 ;;
  "") ;;
  *) echo "Unknown option: $1" >&2; exit 2 ;;
esac

say()  { printf '\033[1;33m▸\033[0m %s\n' "$*"; }
warn() { printf '\033[1;31m!\033[0m %s\n' "$*"; }

# --------------------------------------------------------------- ML artefacts
# The Flask service loads its models from backend/app/ml_models. Copy them out
# of the ML project on first run so the two repos stay independently editable.
sync_models() {
  local dest="$BACKEND/app/ml_models"
  mkdir -p "$dest"

  local missing=0
  for f in freight_forecast_14d.pkl freight_forecast_30d.pkl feature_columns.pkl; do
    [ -f "$dest/$f" ] || missing=1
  done
  [ -f "$dest/master_features_training.csv" ] || missing=1
  [ "$missing" -eq 0 ] && return 0

  if [ ! -d "$ML_SOURCE/models" ]; then
    warn "ML models not found at $ML_SOURCE/models — the API will serve its analytic fallback."
    return 0
  fi

  say "Syncing ML artefacts from $ML_SOURCE"
  cp -f "$ML_SOURCE/models/"*.pkl "$dest/" 2>/dev/null || true
  if [ -f "$ML_SOURCE/data/processed/master_features_training.csv" ]; then
    cp -f "$ML_SOURCE/data/processed/master_features_training.csv" "$dest/"
  elif [ -f "$ML_SOURCE/data/raw/maritime_freight_macro_data.csv" ]; then
    cp -f "$ML_SOURCE/data/raw/maritime_freight_macro_data.csv" "$dest/"
  fi
}

# ------------------------------------------------------------------ backend
setup_backend() {
  if [ ! -x "$VENV/bin/python" ]; then
    say "Creating backend virtualenv"
    python3 -m venv "$VENV"
  fi
  # Probe one import per requirement group, so an existing virtualenv created
  # before a group was added still gets topped up rather than silently running
  # without it. yfinance/pulp were added when the live market feed and the LP
  # solver landed; checking only flask+sklearn would have skipped both.
  if ! "$VENV/bin/python" -c "import flask, sklearn, joblib, yfinance, pulp, bs4" >/dev/null 2>&1; then
    say "Installing backend requirements (this takes a minute the first time)"
    "$VENV/bin/pip" install --quiet --upgrade pip
    "$VENV/bin/pip" install --quiet -r "$BACKEND/requirements.txt"
  fi
}

# --------------------------------------------------------------- port picking
free_port() {
  local port=$1
  for _ in $(seq 0 20); do
    if ! nc -z 127.0.0.1 "$port" >/dev/null 2>&1; then
      echo "$port"; return 0
    fi
    port=$((port + 1))
  done
  echo "$1"
}

PIDS=()
cleanup() {
  trap - INT TERM EXIT
  for pid in "${PIDS[@]:-}"; do
    [ -n "$pid" ] && kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo
  say "Stopped."
}
trap cleanup INT TERM EXIT

API_PORT="${PORT:-5050}"

if [ "$RUN_BACKEND" -eq 1 ]; then
  sync_models
  setup_backend
  # Step past whatever is taken. (5000 is deliberately not the default — on
  # macOS AirPlay Receiver owns it and answers with an empty 403.)
  API_PORT="$(free_port "$API_PORT")"
  say "Flask API      → http://localhost:$API_PORT"
  ( cd "$BACKEND" && PORT="$API_PORT" "$VENV/bin/python" run.py ) &
  PIDS+=($!)
fi

# 127.0.0.1 rather than localhost: Flask binds IPv4, and a resolver that hands
# the proxy ::1 first would get a refused connection before falling back.
API_URL="${VITE_API_URL:-http://127.0.0.1:$API_PORT}"

if [ "$RUN_FRONTEND" -eq 1 ]; then
  if [ ! -d "$FRONTEND/node_modules" ]; then
    say "Installing frontend dependencies"
    ( cd "$FRONTEND" && npm install )
  fi
  say "Vite dev server → http://localhost:5173  (API: $API_URL)"
  ( cd "$FRONTEND" && VITE_API_URL="$API_URL" npm run dev ) &
  PIDS+=($!)
fi

wait
