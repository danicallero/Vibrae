#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later

# Minimal color (respect NO_COLOR)
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

printf "\n%sVibrae%s stop (GPLv3)\n\n" "$BOLD" "$RESET"

# Stop services (ignore if absent)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# Prefer venv if present
if [ -d "$SCRIPT_DIR/venv" ]; then
  # shellcheck disable=SC1091
  source "$SCRIPT_DIR/venv/bin/activate"
fi
LOG_DIR="$SCRIPT_DIR/logs"

info "stopping frontend server"
pkill -f "npx serve" >/dev/null 2>&1 || true
pkill -f "serve -s" >/dev/null 2>&1 || true
pkill -f "node.*serve" >/dev/null 2>&1 || true

info "stopping backend (uvicorn)"
pkill -f "uvicorn" >/dev/null 2>&1 || true

info "stopping cloudflared"
if [ -x "$SCRIPT_DIR/scripts/cfctl.sh" ]; then
  sudo "$SCRIPT_DIR/scripts/cfctl.sh" killall >/dev/null 2>&1 || true
else
  pkill -f "cloudflared" >/dev/null 2>&1 || true
fi
# Remove PID file
CF_PIDFILE="$LOG_DIR/cloudflared.pid"
if [ -f "$CF_PIDFILE" ]; then
  CF_PID=$(cat "$CF_PIDFILE" 2>/dev/null || true)
  if [ -n "$CF_PID" ]; then
    kill -TERM "$CF_PID" >/dev/null 2>&1 || sudo kill -TERM "$CF_PID" >/dev/null 2>&1 || true
    sleep 0.5
    kill -KILL "$CF_PID" >/dev/null 2>&1 || sudo kill -KILL "$CF_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$CF_PIDFILE" >/dev/null 2>&1 || true
fi
# Extra hard stop
sleep 0.5
CF_PIDS="$(pgrep -f "cloudflared" 2>/dev/null || true)"
if [ -n "$CF_PIDS" ]; then
  for pid in $CF_PIDS; do kill -TERM "$pid" >/dev/null 2>&1 || true; done
  sleep 0.5
  CF_PIDS2="$(pgrep -f "cloudflared" 2>/dev/null || true)"
  if [ -n "$CF_PIDS2" ]; then
  for pid in $CF_PIDS2; do kill -KILL "$pid" >/dev/null 2>&1 || sudo kill -KILL "$pid" >/dev/null 2>&1 || true; done
  fi
fi
# Final sudo sweep
sudo pkill -f "cloudflared" >/dev/null 2>&1 || true

# Homebrew hint
if command -v brew >/dev/null 2>&1; then
  if brew services list 2>/dev/null | grep -E '^cloudflared\s' | grep -q started; then
    warn "cloudflared is managed by Homebrew and appears started; to stop completely: brew services stop cloudflared"
  fi
fi

# Stop rotation loop
if [ -f "$LOG_DIR/log-rotate.pid" ]; then
  info "stopping log rotation loop"
  ROT_PID="$(cat "$LOG_DIR/log-rotate.pid" 2>/dev/null || true)"
  if [ -n "$ROT_PID" ]; then
    kill "$ROT_PID" >/dev/null 2>&1 || true
  fi
  rm -f "$LOG_DIR/log-rotate.pid" >/dev/null 2>&1 || true
fi

if [[ "$(uname)" == "Darwin" ]]; then
  info "nginx (macOS): stop"
  # First try graceful shutdown with any running config
  sudo nginx -s stop >/dev/null 2>&1 || true
  nginx -s stop >/dev/null 2>&1 || true
  sleep 1
  # Force kill if still running
  pkill -f "nginx: master process" >/dev/null 2>&1 || true
  sudo pkill -f "nginx: master process" >/dev/null 2>&1 || true
  # Ensure port 80 is freed
  sleep 1
else
  info "nginx (Linux): stop"
  sudo systemctl stop nginx >/dev/null 2>&1 || true
fi

ok "stopped."
