#!/bin/bash

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

# Stop services quietly if not running
info "stopping frontend server"
pkill -f "npx serve" >/dev/null 2>&1 || true
pkill -f "serve -s" >/dev/null 2>&1 || true
pkill -f "node.*serve" >/dev/null 2>&1 || true

info "stopping backend (uvicorn)"
pkill -f "uvicorn" >/dev/null 2>&1 || true

info "stopping cloudflared"
pkill -f "cloudflared" >/dev/null 2>&1 || true

if [[ "$(uname)" == "Darwin" ]]; then
  info "nginx (macOS): stop"
  sudo nginx -s stop >/dev/null 2>&1 || true
else
  info "nginx (Linux): stop"
  sudo systemctl stop nginx >/dev/null 2>&1 || true
fi

ok "stopped."
