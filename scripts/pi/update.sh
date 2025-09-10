#!/bin/bash
# Vibrae auto-update script for Raspberry Pi
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

log(){ printf '[update] %s\n' "$*"; }
warn(){ printf '[warn] %s\n' "$*" >&2; }

# Ensure we are on a git repo
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  warn "not a git repository: $ROOT_DIR"
  exit 0
fi

# Fetch and check if new commits exist on the current branch
branch=$(git rev-parse --abbrev-ref HEAD)
log "current branch: $branch"

# Save current HEAD
current_rev=$(git rev-parse HEAD)

# Configure SSH to use optional deploy key without prompts
if [ -n "${GIT_SSH_PRIVATE_KEY:-}" ] || [ -f /etc/vibrae/deploy_key ]; then
  mkdir -p /root/.ssh 2>/dev/null || true
  chmod 700 /root/.ssh || true
  if [ -n "${GIT_SSH_PRIVATE_KEY:-}" ]; then
    echo "$GIT_SSH_PRIVATE_KEY" > /root/.ssh/vibrae_deploy_key
  else
    cp /etc/vibrae/deploy_key /root/.ssh/vibrae_deploy_key || true
  fi
  chmod 600 /root/.ssh/vibrae_deploy_key
  # Create minimal SSH config
  if ! grep -q 'vibrae-deploy' /root/.ssh/config 2>/dev/null; then
    cat >> /root/.ssh/config <<CFG
Host github.com-vibrae-deploy
  HostName github.com
  User git
  IdentityFile /root/.ssh/vibrae_deploy_key
  StrictHostKeyChecking no
  IdentitiesOnly yes
CFG
    chmod 600 /root/.ssh/config || true
  fi
  export GIT_SSH_COMMAND="ssh -F /root/.ssh/config -o StrictHostKeyChecking=no -o IdentitiesOnly=yes"
else
  export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=no"
fi

# Fetch
"${GIT_SSH_COMMAND}" >/dev/null 2>&1 || true
git fetch --all --quiet || true

# Compare with remote (origin/<branch>)
remote_rev=$(git rev-parse "origin/${branch}" || echo "$current_rev")
if [ "$remote_rev" = "$current_rev" ]; then
  log "no updates"
  exit 0
fi

log "updates found: $current_rev -> $remote_rev"
# Pull latest
if ! git pull --rebase --autostash --quiet; then
  warn "git pull failed; attempting reset"
  git reset --hard "$remote_rev" || true
fi

# Optional: decrypt envs if present (prefer AGE if available)
ENV_FILE="$ROOT_DIR/config/env/.env.backend"
if [ ! -f "$ENV_FILE" ] && [ -f "${ENV_FILE}.enc" ] && command -v sops >/dev/null 2>&1; then
  log "decrypting backend env"
  if [ -f /etc/vibrae/age.key ]; then
    SOPS_AGE_KEY_FILE=/etc/vibrae/age.key SOPS_CONFIG="$ROOT_DIR/.sops.yaml" sops --decrypt "${ENV_FILE}.enc" > "$ENV_FILE" || warn "sops decrypt (AGE) failed"
  else
    if [ -f /etc/vibrae/gpg_pass ]; then
      SOPS_CONFIG="$ROOT_DIR/.sops.yaml" SOPS_GPG_EXEC="gpg --pinentry-mode loopback --passphrase-file /etc/vibrae/gpg_pass" sops --decrypt "${ENV_FILE}.enc" > "$ENV_FILE" || warn "sops decrypt (GPG passfile) failed"
    else
      SOPS_CONFIG="$ROOT_DIR/.sops.yaml" SOPS_GPG_EXEC="gpg --pinentry-mode loopback" sops --decrypt "${ENV_FILE}.enc" > "$ENV_FILE" || warn "sops decrypt (GPG) failed"
    fi
  fi
fi

# Reinstall Python deps when requirements changed or periodically
if [ -d venv ]; then
  . venv/bin/activate
else
  python3 -m venv venv
  . venv/bin/activate
fi
pip install -U pip wheel >/dev/null 2>&1 || true
pip install -r requirements.txt || warn "pip install failed"

# Editable core package
if [ -f packages/core/pyproject.toml ]; then
  pip install -e packages/core || warn "editable vibrae_core install failed"
fi

# Recreate systemd units if setup changed (idempotent)
if [ -f scripts/pi/setup.sh ]; then
  log "refreshing systemd units"
  bash scripts/pi/setup.sh || warn "setup refresh failed"
fi

# Restart services
log "restarting services"
systemctl restart vibrae-backend.service || true
if systemctl is-enabled vibrae-frontend.service >/dev/null 2>&1; then
  systemctl restart vibrae-frontend.service || true
fi
if systemctl is-enabled vibrae-cloudflared.service >/dev/null 2>&1; then
  systemctl restart vibrae-cloudflared.service || true
fi

log "update complete"
