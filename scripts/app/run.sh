#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -e
# Quieter background job handling
set +m 2>/dev/null || true

# Base dir for relative paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Minimal color (respect NO_COLOR and non-TTY)
if [ -z "$NO_COLOR" ] && [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  BOLD="$(tput bold)"; RESET="$(tput sgr0)"
  RED="$(tput setaf 1)"; GREEN="$(tput setaf 2)"; YELLOW="$(tput setaf 3)"; BLUE="$(tput setaf 4)"
else
  BOLD=""; RESET=""; RED=""; GREEN=""; YELLOW=""; BLUE=""
fi
info(){ printf "%s[info]%s %s\n" "$BLUE" "$RESET" "$*"; }
ok(){ printf "%s[ok]%s %s\n" "$GREEN" "$RESET" "$*"; }
warn(){ printf "%s[warn]%s %s\n" "$YELLOW" "$RESET" "$*"; }
err(){ printf "%s[err ]%s %s\n" "$RED" "$RESET" "$*" 1>&2; }

printf "%sVibrae%s (GPLv3, no warranty)\n\n" "$BOLD" "$RESET"

# Ensure 'vibrae' is on PATH
if ! command -v vibrae >/dev/null 2>&1; then
  CLI_SRC="$SCRIPT_DIR/vibrae"
  if [ -f "$CLI_SRC" ]; then
    chmod +x "$CLI_SRC" 2>/dev/null || true
    DEST="/usr/local/bin/vibrae"
    if ln -sf "$CLI_SRC" "$DEST" 2>/dev/null; then
      info "installed vibrae at $DEST"
    elif command -v sudo >/dev/null 2>&1 && sudo ln -sf "$CLI_SRC" "$DEST" 2>/dev/null; then
      info "installed vibrae at $DEST"
    else
      mkdir -p "$HOME/.local/bin" 2>/dev/null || true
      DEST_LOCAL="$HOME/.local/bin/vibrae"
      if ln -sf "$CLI_SRC" "$DEST_LOCAL" 2>/dev/null; then
        warn "installed vibrae at $DEST_LOCAL. Add 'export PATH=\$HOME/.local/bin:\$PATH' to your shell profile"
      fi
    fi
  fi
fi

# Log dirs & rotation
LOG_DIR="$SCRIPT_DIR/logs"
HISTORY_DIR="$LOG_DIR/history"
mkdir -p "$LOG_DIR" "$HISTORY_DIR"

rotate_log() {
  # rotate_log <file> [keep] [history_dir]
  local file="$1"
  local keep="${2:-5}"
  local history_dir="${3:-$HISTORY_DIR}"
  [ -f "$file" ] || return 0
  if [ -s "$file" ]; then
    local ts; ts="$(date +"%Y%m%d-%H%M%S")"
    local name ext base
    name="$(basename "$file")"
    ext="${name##*.}"
    if [ "$ext" = "$name" ]; then ext="log"; base="$name"; else base="${name%.*}"; fi
    local rotated="$history_dir/${base}-${ts}.${ext}"
    cp "$file" "$rotated" 2>/dev/null || cat "$file" > "$rotated"
    : > "$file"
    # prune older rotations for this base
    ls -1t "$history_dir/${base}-"*."$ext" 2>/dev/null | sed -e "1,${keep}d" | xargs -I {} rm -f -- {} 2>/dev/null || true
  else
    : > "$file"
  fi
}

# Rotation policy (configurable via env)
LOG_KEEP="${LOG_KEEP:-5}"
LOG_ROTATE_INTERVAL_HOURS="${LOG_ROTATE_INTERVAL_HOURS:-12}"

# Prefix each output line with a timestamp and append to the given log file
log_cmd() {
  local logfile="$1"; shift
  local qcmd="" arg arg_quoted
  for arg in "$@"; do
    printf -v arg_quoted '%q' "$arg"
    qcmd+="$arg_quoted "
  done
  # Run command and prefix each line with timestamp
  nohup bash -lc "$qcmd 2>&1" | while IFS= read -r line; do
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$line"
  done >> "$logfile" 2>&1 &
}

# Require prior installation and activate venv
if [ ! -f "$SCRIPT_DIR/.installed" ]; then
  err "setup has not been run. Please run ./setup.sh first."
  exit 1
fi
if [ -d "$SCRIPT_DIR/venv" ]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/venv/bin/activate"
else
  err "Python venv missing. Please run ./setup.sh to create it."
  exit 1
fi

# Load .env (export all vars)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  . "$SCRIPT_DIR/.env"
  set +a
fi

# Export web build if missing (optional)
FRONTEND_DIST="${FRONTEND_DIST:-/apps/web/dist}"
FRONTEND_PORT="${FRONTEND_PORT:-9081}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_MODULE="${BACKEND_MODULE:-apps.api.src.vibrae_api.main:app}"

SERVE_ROOT="$SCRIPT_DIR$FRONTEND_DIST"
if [ ! -d "$SERVE_ROOT" ]; then
  if command -v npm >/dev/null 2>&1; then
    warn "missing frontend export at $SERVE_ROOT; exporting now"
  (cd "$SCRIPT_DIR/apps/web" && npx expo export --platform web) || warn "web export failed; frontend may be unavailable"
  else
    warn "Node/npm not available; skipping web export. Frontend may be unavailable."
  fi
fi

# Frontend (static)
if command -v npx >/dev/null 2>&1 && [ -d "$SERVE_ROOT" ]; then
  info "frontend: port $FRONTEND_PORT"
  rotate_log "$LOG_DIR/serve.log" "$LOG_KEEP" "$HISTORY_DIR"
  echo "----- $(date) start serve on :$FRONTEND_PORT -----" >> "$LOG_DIR/serve.log"
  export FRONTEND_MODE=npx
  log_cmd "$LOG_DIR/serve.log" npx serve -s "$SERVE_ROOT" -l "$FRONTEND_PORT"
else
  warn "frontend static server not started (missing npx or export). API will still run."
fi

# Backend API
info "backend: port $BACKEND_PORT"
rotate_log "$LOG_DIR/backend.log" "$LOG_KEEP" "$HISTORY_DIR"
echo "----- $(date) start uvicorn on :$BACKEND_PORT ($BACKEND_MODULE) -----" >> "$LOG_DIR/backend.log"

## Logging config (simplified)
# Player/application logs land in backend.log via shared config; keep a dedicated player.log rotated for legacy readers.
rotate_log "$LOG_DIR/player.log" "$LOG_KEEP" "$HISTORY_DIR"
echo "----- $(date) start player logs -----" >> "$LOG_DIR/player.log"
LOG_CFG="$SCRIPT_DIR/config/logging.ini"

# Run uvicorn from repo root so imports work; capture all output.
(cd "$SCRIPT_DIR" && nohup env PYTHONPATH="$SCRIPT_DIR:$(pwd)/packages/core/src:$(pwd)/apps/api/src" \
  uvicorn "$BACKEND_MODULE" --host 0.0.0.0 --port "$BACKEND_PORT" --log-config "$LOG_CFG" \
  >> "$LOG_DIR/backend.log" 2>&1 &)

# Detach background jobs
jobs >/dev/null 2>&1 || true
disown -a 2>/dev/null || true

# Nginx startup (render config if envsubst available)
OS_TYPE=$(uname)
if [[ "$OS_TYPE" == "Darwin" ]]; then
  info "nginx (macOS): start"
  if ! command -v nginx >/dev/null 2>&1; then
    warn "nginx not installed; skipping reverse proxy on macOS."
  else
  # Preflight: if something already holds :80, attempt cleanup if it's nginx; otherwise skip.
  if lsof -nP -iTCP:80 -sTCP:LISTEN 2>/dev/null | grep -q nginx; then
    warn ":80 already in use by existing nginx; stopping it first"
    pkill -f 'nginx: master process' >/dev/null 2>&1 || sudo pkill -f 'nginx: master process' >/dev/null 2>&1 || true
    sleep 1
  elif lsof -nP -iTCP:80 -sTCP:LISTEN 2>/dev/null | grep -q LISTEN; then
    warn ":80 in use by another process; skipping nginx startup (app still available on backend ports)"
    START_NGINX=0
  else
    START_NGINX=1
  fi
  : "${START_NGINX:=1}"
  if [ "$START_NGINX" -eq 0 ]; then
    : # skip nginx block entirely
  else
  # Render nginx config with env vars into a temp file
  if command -v envsubst >/dev/null 2>&1; then
  # macOS mktemp requires -t
    RENDERED_NGINX_CONF=$(mktemp -t nginx.vibrae)
  # Substitute only our vars (avoid nginx runtime ones like $host)
    DOMAIN_VAL="${DOMAIN:-_}"
    BACKEND_VAL="$BACKEND_PORT"
    FRONTEND_VAL="$FRONTEND_PORT"
    DOMAIN="$DOMAIN_VAL" BACKEND_PORT="$BACKEND_VAL" FRONTEND_PORT="$FRONTEND_VAL" \
      envsubst '${DOMAIN} ${BACKEND_PORT} ${FRONTEND_PORT}' < "$NGINX_CONF" > "$RENDERED_NGINX_CONF"
  # Restart clean if already running
    if pgrep -x nginx >/dev/null 2>&1; then
      warn "nginx already running; stopping for clean restart"
      if [ -x "$SCRIPT_DIR/scripts/nginxctl.sh" ]; then
        sudo "$SCRIPT_DIR/scripts/nginxctl.sh" stop >/dev/null 2>&1 || true
      else
        sudo nginx -s stop >/dev/null 2>&1 || true
      fi
      sleep 1
    fi
  if [ -x "$SCRIPT_DIR/scripts/nginxctl.sh" ]; then
    sudo "$SCRIPT_DIR/scripts/nginxctl.sh" start "$RENDERED_NGINX_CONF"
  else
    sudo nginx -c "$RENDERED_NGINX_CONF"
  fi
  else
    warn "envsubst not found. Using nginx.conf as-is."
    if pgrep -x nginx >/dev/null 2>&1; then
      warn "nginx already running; stopping for clean restart"
      if [ -x "$SCRIPT_DIR/scripts/nginxctl.sh" ]; then
        sudo "$SCRIPT_DIR/scripts/nginxctl.sh" stop >/dev/null 2>&1 || true
      else
        sudo nginx -s stop >/dev/null 2>&1 || true
      fi
      sleep 1
    fi
    if [ -x "$SCRIPT_DIR/scripts/nginxctl.sh" ]; then
      sudo "$SCRIPT_DIR/scripts/nginxctl.sh" start "$NGINX_CONF"
    else
      sudo nginx -c "$NGINX_CONF"
    fi
  fi
  fi
  fi
else
  info "nginx (Linux): start"
  # Restart to pick up config changes and avoid bind errors
  if command -v systemctl >/dev/null 2>&1; then
    sudo systemctl restart nginx || warn "could not restart nginx"
  else
    warn "systemctl not available; skipping nginx restart"
  fi
fi

# Cloudflare tunnel (retry)
CF_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
if [ -z "$CF_TUNNEL_TOKEN" ] || ! command -v cloudflared >/dev/null 2>&1; then
  if [ -z "$CF_TUNNEL_TOKEN" ]; then warn "Cloudflared token missing; skipping tunnel"; fi
  if ! command -v cloudflared >/dev/null 2>&1; then warn "cloudflared not installed; skipping tunnel"; fi
  CF_TUNNEL_TOKEN=""
fi
unset CLOUDFLARE_TUNNEL_TOKEN

start_cloudflared_with_retry() {
  local max_attempts=3
  local attempt=1
  local wait_seconds=2
  local connect_timeout=20

  while [ $attempt -le $max_attempts ]; do
    info "cloudflared: attempt $attempt/$max_attempts"
  # Stop existing instance
    pkill -f "cloudflared" >/dev/null 2>&1 || true
  # Rotate once (first attempt)
    local CF_LOG="$LOG_DIR/cloudflared.log"
    if [ "$attempt" -eq 1 ]; then
  rotate_log "$CF_LOG" "$LOG_KEEP" "$HISTORY_DIR"
    fi
    echo "----- $(date) cloudflared attempt $attempt -----" >> "$CF_LOG"
  # Start
  nohup env -u CLOUDFLARE_TUNNEL_TOKEN cloudflared tunnel run --protocol http2 --token "$CF_TUNNEL_TOKEN" >> "$CF_LOG" 2>&1 &
  local cf_pid=$!
  echo "$cf_pid" > "$LOG_DIR/cloudflared.pid" 2>/dev/null || true

  # Wait for success line
    local elapsed=0
    while [ $elapsed -lt $connect_timeout ]; do
      sleep 1
      elapsed=$((elapsed + 1))
  if grep -q "Registered tunnel connection" "$CF_LOG"; then
  ok "cloudflared: connected (pid $cf_pid)"
        return 0
      fi
  # If process died, retry
      if ! ps -p $cf_pid >/dev/null 2>&1; then
        warn "cloudflared: exited; retrying"
        break
      fi
    done

    warn "cloudflared: no connection in ${connect_timeout}s; wait ${wait_seconds}s"
    sleep $wait_seconds
    attempt=$((attempt + 1))
  done

  err "cloudflared: failed after $max_attempts attempts (see cloudflared.log)"
  return 1
}

if [ -n "$CF_TUNNEL_TOKEN" ]; then
  start_cloudflared_with_retry || warn "cloudflared failed to connect; app will still run locally"
fi

# Periodic rotation loop
(
  set -e
  INTERVAL_HRS="${LOG_ROTATE_INTERVAL_HOURS:-12}"
  case "$INTERVAL_HRS" in
    *[!0-9]*|"") INTERVAL_HRS=12 ;;
  esac
  INTERVAL_SEC=$(( INTERVAL_HRS * 3600 ))
  printf '%s\n' "[info] periodic log rotation every ${INTERVAL_HRS}h (keep ${LOG_KEEP})" >> "$LOG_DIR/serve.log"
  while true; do
    sleep "$INTERVAL_SEC"
    rotate_log "$LOG_DIR/backend.log" "$LOG_KEEP" "$HISTORY_DIR"
    rotate_log "$LOG_DIR/player.log" "$LOG_KEEP" "$HISTORY_DIR"
    rotate_log "$LOG_DIR/serve.log" "$LOG_KEEP" "$HISTORY_DIR"
    rotate_log "$LOG_DIR/cloudflared.log" "$LOG_KEEP" "$HISTORY_DIR"
  done
) >/dev/null 2>&1 &
echo $! > "$LOG_DIR/log-rotate.pid"

# Detach again in case new background jobs were spawned later
jobs >/dev/null 2>&1 || true
disown -a 2>/dev/null || true

ok "done."