#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# CLI Helper Functions - Colors, Output, and Utilities

# ============================================
# COLORS & OUTPUT
# ============================================
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  export BOLD="$(tput bold)"
  export RESET="$(tput sgr0)"
  export RED="$(tput setaf 1)"
  export GREEN="$(tput setaf 2)"
  export YELLOW="$(tput setaf 3)"
  export BLUE="$(tput setaf 4)"
  export CYAN="$(tput setaf 6)"
  export GREY="$(tput setaf 8 2>/dev/null || tput setaf 7)"
else
  export BOLD="" RESET="" RED="" GREEN="" YELLOW="" BLUE="" CYAN="" GREY=""
fi

# Disable colors if requested
if [ -n "${NO_COLOR-}" ] || [ "${VIBRAE_NO_COLOR-0}" = "1" ]; then
  BOLD="" RESET="" RED="" GREEN="" YELLOW="" BLUE="" CYAN="" GREY=""
fi

# ============================================
# OUTPUT HELPERS
# ============================================
ok()   { echo "${GREEN}✓${RESET} $*"; }
warn() { echo "${YELLOW}⚠${RESET} $*" >&2; }
err()  { echo "${RED}✗${RESET} $*" >&2; }
info() { echo "${CYAN}→${RESET} $*"; }
header() { echo ""; echo "${BOLD}${BLUE}$*${RESET}"; echo ""; }

# ============================================
# PATH RESOLUTION
# ============================================
resolve_script_path() {
  local src="${BASH_SOURCE[0]}"
  while [ -h "$src" ]; do
    local dir
    dir="$(cd -P "$(dirname "$src")" && pwd)"
    src="$(readlink "$src")"
    [[ "$src" != /* ]] && src="$dir/$src"
  done
  echo "$src"
}

# ============================================
# ENVIRONMENT HELPERS
# ============================================
ensure_venv() {
  local venv="$1"
  if [ ! -d "$venv" ]; then
    info "Creating virtual environment..."
    python3 -m venv "$venv" || {
      err "Failed to create virtual environment"
      return 1
    }
    "$venv/bin/pip" install --upgrade pip >/dev/null 2>&1
  fi
}

ensure_env_file() {
  local env_file="$1"
  local env_example="$2"
  
  if [ ! -f "$env_file" ]; then
    warn "Config file not found: $env_file"
    if [ -f "$env_example" ]; then
      info "Creating from template..."
      mkdir -p "$(dirname "$env_file")"
      cp "$env_example" "$env_file" || {
        err "Could not create config file"
        return 1
      }
      ok "Created $env_file"
      info "Edit this file and set your configuration (SECRET_KEY, DOMAIN, etc.)"
      return 2  # Signal that config was created but needs editing
    else
      err "Template not found: $env_example"
      return 1
    fi
  fi
}

# ============================================
# PROCESS HELPERS
# ============================================
is_running() {
  local pattern="$1"
  pgrep -f "$pattern" >/dev/null 2>&1
}

get_pid() {
  local pattern="$1"
  pgrep -f "$pattern" 2>/dev/null
}

# ============================================
# SOPS HELPERS
# ============================================
sops_check() {
  if ! command -v sops >/dev/null 2>&1; then
    err "SOPS not found. Install it first:"
    info "  brew install sops    # macOS"
    info "  Or visit: https://github.com/mozilla/sops"
    return 1
  fi
  return 0
}

sops_encrypt() {
  local plain="$1"
  local enc="$2"
  
  sops_check || return 1
  
  if [ ! -f "$plain" ]; then
    err "Source file not found: $plain"
    return 1
  fi
  
  grep -qE '^[A-Z0-9_]+=.*' "$plain" || {
    err "File appears empty (no KEY=value lines)"
    return 1
  }
  
  sops --encrypt "$plain" > "$enc" || {
    err "SOPS encryption failed"
    return 1
  }
  
  ok "Encrypted → $(basename "$enc")"
  warn "Keep plaintext $(basename "$plain") safe (NOT in git)"
}

sops_decrypt() {
  local enc="$1"
  local plain="$2"
  
  sops_check || return 1
  
  if [ ! -f "$enc" ]; then
    err "Encrypted file not found: $enc"
    return 1
  fi
  
  sops --decrypt "$enc" > "$plain" || {
    err "SOPS decryption failed"
    return 1
  }
  
  ok "Decrypted → $(basename "$plain")"
  warn "DO NOT commit $(basename "$plain")"
}

sops_edit() {
  local enc="$1"
  local plain="$2"
  local editor="${EDITOR:-${VISUAL:-nano}}"
  
  sops_check || return 1
  
  if [ ! -f "$enc" ]; then
    err "Encrypted file not found: $enc"
    return 1
  fi
  
  # Decrypt to temp location
  sops_decrypt "$enc" "$plain" || return 1
  
  # Edit
  "$editor" "$plain"
  
  # Re-encrypt
  sops_encrypt "$plain" "$enc" || return 1
  
  ok "Updated $(basename "$enc")"
}
