#!/bin/bash
set -e

# Base dir for relative paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# --- minimal colored output (respects NO_COLOR and non-TTY) ---
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

# --- log directories and rotation ---
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
  # Run command and prefix each line with a fresh timestamp
  nohup bash -lc "$qcmd 2>&1" | while IFS= read -r line; do
    printf '%s %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$line"
  done >> "$logfile" 2>&1 &
}

# Activate Python venv if exists
if [ -d venv ]; then
  source venv/bin/activate
fi

# Load .env (export all vars)
if [ -f "$SCRIPT_DIR/.env" ]; then
  set -a
  . "$SCRIPT_DIR/.env"
  set +a
fi

# Start frontend (static server)
info "frontend: port $FRONTEND_PORT"
SERVE_ROOT="$SCRIPT_DIR$FRONTEND_DIST"
if [ ! -d "$SERVE_ROOT" ]; then
  err "missing frontend dir: $SERVE_ROOT"
  exit 1
fi
rotate_log "$LOG_DIR/serve.log" "$LOG_KEEP" "$HISTORY_DIR"
echo "----- $(date) start serve on :$FRONTEND_PORT -----" >> "$LOG_DIR/serve.log"
log_cmd "$LOG_DIR/serve.log" npx serve -s "$SERVE_ROOT" -l "$FRONTEND_PORT"

# Start backend API
info "backend: port $BACKEND_PORT"
rotate_log "$LOG_DIR/backend.log" "$LOG_KEEP" "$HISTORY_DIR"
echo "----- $(date) start uvicorn on :$BACKEND_PORT ($BACKEND_MODULE) -----" >> "$LOG_DIR/backend.log"

# Build a logging config for uvicorn: uvicorn logs -> backend.log; app logs -> player.log
rotate_log "$LOG_DIR/player.log" "$LOG_KEEP" "$HISTORY_DIR"
echo "----- $(date) start player logs -----" >> "$LOG_DIR/player.log"
LOG_CFG="$SCRIPT_DIR/backend/logging.ini"
LOG_LEVEL_EFF="$(echo "${LOG_LEVEL:-INFO}" | tr '[:lower:]' '[:upper:]')"
# Render a per-run logging config with the effective log level
LOG_CFG_RENDERED="$LOG_DIR/uvicorn_logging.$(date +%Y%m%d-%H%M%S).ini"
sed "s/__LOG_LEVEL__/${LOG_LEVEL_EFF}/g" "$LOG_CFG" > "$LOG_CFG_RENDERED"
# Prune older rendered configs; keep the latest 3
ls -1t "$LOG_DIR"/uvicorn_logging.*.ini 2>/dev/null | sed -e '1,1d' | xargs -I {} rm -f -- "{}" 2>/dev/null || true
# Remove any obsolete static config if present
[ -f "$LOG_DIR/uvicorn_logging.ini" ] && rm -f "$LOG_DIR/uvicorn_logging.ini"

# Uvicorn writes to logs via logging.ini handlers (with timestamps); silence stdout
nohup uvicorn "$BACKEND_MODULE" --host 0.0.0.0 --port "$BACKEND_PORT" --log-config "$LOG_CFG_RENDERED" >/dev/null 2>&1 &

# Detect OS and start nginx appropriately, rendering config from template with env vars
OS_TYPE=$(uname)
if [[ "$OS_TYPE" == "Darwin" ]]; then
  info "nginx (macOS): start"
  # Render nginx config with env vars into a temp file
  if command -v envsubst >/dev/null 2>&1; then
    # macOS mktemp requires -t with a prefix; it outputs a unique file path
    RENDERED_NGINX_CONF=$(mktemp -t nginx.vibrae)
    # Only substitute our own variables to avoid touching nginx runtime vars like $host
    envsubst '${DOMAIN} ${BACKEND_PORT} ${FRONTEND_PORT}' < "$NGINX_CONF" > "$RENDERED_NGINX_CONF"
    sudo nginx -c "$RENDERED_NGINX_CONF"
  else
    warn "envsubst not found. Using nginx.conf as-is."
    sudo nginx -c "$NGINX_CONF"
  fi
else
  info "nginx (Linux): start"
  sudo systemctl start nginx
fi

# Start Cloudflare Tunnel (retry on failure)
CF_TUNNEL_TOKEN="${CLOUDFLARE_TUNNEL_TOKEN:-}"
if [ -z "$CF_TUNNEL_TOKEN" ]; then
  err "missing CLOUDFLARE_TUNNEL_TOKEN in .env"
  exit 1
fi
# Don't leak token to child env (prevents it showing in logs)
unset CLOUDFLARE_TUNNEL_TOKEN

start_cloudflared_with_retry() {
  local max_attempts=3
  local attempt=1
  local wait_seconds=2
  local connect_timeout=20

  while [ $attempt -le $max_attempts ]; do
    info "cloudflared: attempt $attempt/$max_attempts"
    # Stop any existing cloudflared instance
    pkill -f "cloudflared" >/dev/null 2>&1 || true
    # Rotate log once (on first attempt), then append
    local CF_LOG="$LOG_DIR/cloudflared.log"
    if [ "$attempt" -eq 1 ]; then
  rotate_log "$CF_LOG" "$LOG_KEEP" "$HISTORY_DIR"
    fi
    echo "----- $(date) cloudflared attempt $attempt -----" >> "$CF_LOG"
    # Start
    nohup env -u CLOUDFLARE_TUNNEL_TOKEN cloudflared tunnel run --protocol http2 --token "$CF_TUNNEL_TOKEN" >> "$CF_LOG" 2>&1 &
    local cf_pid=$!

    # Wait for success signature in logs
    local elapsed=0
    while [ $elapsed -lt $connect_timeout ]; do
      sleep 1
      elapsed=$((elapsed + 1))
  if grep -q "Registered tunnel connection" "$CF_LOG"; then
        ok "cloudflared: connected (pid $cf_pid)"
        return 0
      fi
      # If process exited early, break and retry
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

start_cloudflared_with_retry || exit 1

## Start periodic rotation in background (nohup)
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

ok "done."