#!/usr/bin/env bash
# SPDX-License-Identifier: GPL-3.0-or-later
# Environment Manager - Config and Encryption Operations

# Source helpers (expects ROOT_DIR to be set)
if [ -z "$ROOT_DIR" ]; then
  echo "ERROR: ROOT_DIR not set" >&2
  exit 1
fi

# shellcheck source=lib/cli-helpers.sh
. "$ROOT_DIR/lib/cli-helpers.sh"

# ============================================
# PATHS
# ============================================
ENV_DIR="$ROOT_DIR/config/env"
ENV_EXAMPLE="$ENV_DIR/.env.example"
ENV_BACKEND="$ENV_DIR/.env.backend"
ENV_BACKEND_ENC="$ENV_DIR/.env.backend.enc"
ENV_FRONTEND="$ENV_DIR/.env.frontend"
ENV_FRONTEND_ENC="$ENV_DIR/.env.frontend.enc"
ENV_FRONTEND_EXAMPLE="$ENV_DIR/.env.frontend.example"

# ============================================
# BASIC ENV COMMANDS
# ============================================

env_show() {
  local target="${1:-backend}"
  local env_file
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  if [ ! -f "$env_file" ]; then
    warn "Config file not found: $env_file"
    info "Run: vibrae env init $target"
    return 1
  fi
  
  cat "$env_file"
}

env_edit() {
  local target="${1:-backend}"
  local editor="${EDITOR:-${VISUAL:-nano}}"
  local env_file
  local env_example
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      env_example="$ENV_EXAMPLE"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      env_example="$ENV_FRONTEND_EXAMPLE"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  ensure_env_file "$env_file" "$env_example"
  local result=$?
  if [ $result -eq 1 ]; then
    return 1
  elif [ $result -eq 2 ]; then
    # File was just created, edit it now
    true
  fi
  
  "$editor" "$env_file"
  ok "Config updated: $target"
}

env_init() {
  local target="${1:-backend}"
  local env_file
  local env_example
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      env_example="$ENV_EXAMPLE"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      env_example="$ENV_FRONTEND_EXAMPLE"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  if [ -f "$env_file" ]; then
    warn "Config already exists: $env_file"
    info "Use 'vibrae env edit $target' to modify it"
    return 0
  fi
  
  ensure_env_file "$env_file" "$env_example" || return 1
  
  ok "Config initialized: $target"
  info "Edit with: vibrae env edit $target"
}

env_sync() {
  local target="${1:-backend}"
  local env_file
  local env_example
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      env_example="$ENV_EXAMPLE"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      env_example="$ENV_FRONTEND_EXAMPLE"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  # Ensure config exists with defaults
  if [ ! -f "$env_file" ]; then
    env_init "$target"
  else
    info "Config already exists: $target"
    info "Use 'vibrae env edit $target' to modify"
  fi
}

env_get() {
  local target
  local key
  local env_file
  
  # Determine if first arg is a target or a key
  if [ "$1" = "backend" ] || [ "$1" = "frontend" ]; then
    target="$1"
    key="$2"
  else
    target="backend"
    key="$1"
  fi
  
  if [ -z "$key" ]; then
    err "Usage: vibrae env get [backend|frontend] <KEY>"
    return 1
  fi
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  if [ ! -f "$env_file" ]; then
    err "Config file not found: $env_file"
    return 1
  fi
  
  grep -E "^${key}=" "$env_file" | cut -d= -f2- || {
    warn "Key not found: $key"
    return 1
  }
}

env_set() {
  local target
  local key
  local value
  local env_file
  local env_example
  
  # Determine if first arg is a target or a key
  if [ "$1" = "backend" ] || [ "$1" = "frontend" ]; then
    target="$1"
    key="$2"
    value="$3"
  else
    target="backend"
    key="$1"
    value="$2"
  fi
  
  if [ -z "$key" ] || [ -z "$value" ]; then
    err "Usage: vibrae env set [backend|frontend] <KEY> <VALUE>"
    return 1
  fi
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      env_example="$ENV_EXAMPLE"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      env_example="$ENV_FRONTEND_EXAMPLE"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  ensure_env_file "$env_file" "$env_example" || return 1
  
  # Check if key exists
  if grep -qE "^${key}=" "$env_file"; then
    # Update existing
    sed -i.bak "s|^${key}=.*|${key}=${value}|" "$env_file"
    rm -f "${env_file}.bak"
    ok "Updated: $key ($target)"
  else
    # Add new
    echo "${key}=${value}" >> "$env_file"
    ok "Added: $key ($target)"
  fi
}


# ============================================
# ENCRYPTION COMMANDS
# ============================================

env_encrypt() {
  local target="${1:-backend}"
  local env_file
  local env_enc
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      env_enc="$ENV_BACKEND_ENC"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      env_enc="$ENV_FRONTEND_ENC"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  if [ ! -f "$env_file" ]; then
    err "No config file to encrypt: $env_file"
    info "Create one first: vibrae env init $target"
    return 1
  fi
  
  sops_encrypt "$env_file" "$env_enc"
}

env_decrypt() {
  local target="${1:-backend}"
  local env_file
  local env_enc
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      env_enc="$ENV_BACKEND_ENC"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      env_enc="$ENV_FRONTEND_ENC"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  if [ ! -f "$env_enc" ]; then
    err "No encrypted file found: $env_enc"
    return 1
  fi
  
  sops_decrypt "$env_enc" "$env_file"
}

env_edit_sec() {
  local target="${1:-backend}"
  local env_file
  local env_enc
  
  case "$target" in
    backend)
      env_file="$ENV_BACKEND"
      env_enc="$ENV_BACKEND_ENC"
      ;;
    frontend)
      env_file="$ENV_FRONTEND"
      env_enc="$ENV_FRONTEND_ENC"
      ;;
    *)
      err "Invalid target: $target (use 'backend' or 'frontend')"
      return 1
      ;;
  esac
  
  if [ ! -f "$env_enc" ]; then
    err "No encrypted file found: $env_enc"
    info "Encrypt your config first: vibrae env encrypt $target"
    return 1
  fi
  
  sops_edit "$env_enc" "$env_file"
}

# ============================================
# ENV SUBCOMMAND ROUTER
# ============================================

env_help() {
  cat <<'EOF'
Environment Configuration Commands

Basic:
  vibrae env init [backend|frontend]             Create config from template
  vibrae env edit [backend|frontend]             Edit config file
  vibrae env show [backend|frontend]             Display current config
  vibrae env get [backend|frontend] <KEY>        Get a specific value
  vibrae env set [backend|frontend] <KEY> <VAL>  Set a specific value
  vibrae env sync [backend|frontend]             Ensure config exists

Encryption (requires SOPS):
  vibrae env encrypt [backend|frontend]          Encrypt config file
  vibrae env decrypt [backend|frontend]          Decrypt config file
  vibrae env edit-sec [backend|frontend]         Edit encrypted config

Examples:
  vibrae env init                          # Create backend config
  vibrae env init frontend                 # Create frontend config
  vibrae env edit backend                  # Edit backend config
  vibrae env edit frontend                 # Edit frontend config
  vibrae env set backend SECRET_KEY abc    # Set backend value
  vibrae env set frontend API_URL http://  # Set frontend value
  vibrae env get DOMAIN                    # Get backend value
  vibrae env encrypt frontend              # Encrypt frontend config
  vibrae env edit-sec backend              # Edit encrypted backend

Config files:
  Backend:  config/env/.env.backend
  Frontend: config/env/.env.frontend
EOF
}

env_main() {
  local subcmd="${1:-help}"
  shift || true
  
  case "$subcmd" in
    show)       env_show "$@" ;;
    edit)       env_edit "$@" ;;
    init)       env_init "$@" ;;
    sync)       env_sync "$@" ;;
    get)        env_get "$@" ;;
    set)        env_set "$@" ;;
    encrypt)    env_encrypt "$@" ;;
    decrypt)    env_decrypt "$@" ;;
    edit-sec)   env_edit_sec "$@" ;;
    help|-h|--help) env_help "$@" ;;
    *)
      err "Unknown env command: $subcmd"
      echo ""
      env_help
      return 1
      ;;
  esac
}
