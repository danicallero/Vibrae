#!/bin/bash
# Vibrae Raspberry Pi setup — install deps, venv, systemd units, nginx site
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Canonical backend env lives under config/env/.env.backend
ENV_FILE="$ROOT_DIR/config/env/.env.backend"

if [ "$(id -u)" -ne 0 ]; then
  echo "[err ] please run as root (sudo)" >&2; exit 1
fi

echo "[info] apt install dependencies"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  python3 python3-venv python3-dev build-essential \
  nginx nodejs npm gettext-base curl ca-certificates \
  git sops vlc || true

echo "[info] python venv + pip deps"
cd "$ROOT_DIR"
python3 -m venv venv
source venv/bin/activate
pip install -U pip wheel
pip install -r requirements.txt

# Install vibrae_core in editable mode so imports work without extra PYTHONPATH
if [ -f "$ROOT_DIR/packages/core/pyproject.toml" ]; then
  echo "[info] installing vibrae_core (editable)"
  pip install -e "$ROOT_DIR/packages/core" || echo "[warn] editable vibrae_core install failed"
fi

echo "[info] frontend export (optional)"
if [ ! -d "$ROOT_DIR/apps/web/dist" ]; then
  echo "[warn] apps/web/dist not found. For best performance, copy a prebuilt export to apps/web/dist." >&2
fi

echo "[info] harden creds for non-interactive ops"
# Prepare directories
mkdir -p /root/.gnupg /root/.ssh /etc/vibrae 2>/dev/null || true
chmod 700 /root/.gnupg /root/.ssh || true
chmod 755 /etc/vibrae || true

# Optional: configure SOPS with AGE key for passwordless decrypts
if [ -n "${AGE_PRIVATE_KEY:-}" ]; then
  echo "[info] installing AGE key to /etc/vibrae/age.key"
  printf '%s\n' "$AGE_PRIVATE_KEY" > /etc/vibrae/age.key
  chmod 600 /etc/vibrae/age.key
  export SOPS_AGE_KEY_FILE=/etc/vibrae/age.key
fi

# Optional: persist SSH deploy key for git pulls without prompting
if [ -n "${GIT_SSH_PRIVATE_KEY:-}" ]; then
  echo "[info] installing git deploy key to /etc/vibrae/deploy_key"
  printf '%s\n' "$GIT_SSH_PRIVATE_KEY" > /etc/vibrae/deploy_key
  chmod 600 /etc/vibrae/deploy_key
fi

# Pre-populate known_hosts to avoid first-time host fingerprint prompts
if command -v ssh-keyscan >/dev/null 2>&1; then
  touch /root/.ssh/known_hosts
  chmod 600 /root/.ssh/known_hosts || true
  for host in github.com gitlab.com; do
    if ! ssh-keyscan -T 5 "$host" 2>/dev/null | grep -q "$host"; then
      : # ignore unreachable
    fi
    ssh-keyscan -T 5 "$host" 2>/dev/null >> /root/.ssh/known_hosts || true
  done
fi

echo "[info] create systemd units"
BACKEND_PORT=8000
FRONTEND_PORT=9081
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

# Optional: import GPG keys from environment for SOPS decryption
if [ -n "${GPG_PRIVATE_KEY:-}" ]; then
  echo "[info] importing GPG private key from env"
  printf '%s' "$GPG_PRIVATE_KEY" | gpg --batch --import || true
fi
if [ -n "${GPG_OWNERTRUST:-}" ]; then
  echo "[info] importing GPG ownertrust from env"
  printf '%s' "$GPG_OWNERTRUST" | gpg --batch --import-ownertrust || true
fi

# Configure gpg-agent for loopback pinentry and long cache (avoid passphrase prompts)
if command -v gpgconf >/dev/null 2>&1; then
  GPG_AGENT_CONF="/root/.gnupg/gpg-agent.conf"
  if ! grep -q 'allow-loopback-pinentry' "$GPG_AGENT_CONF" 2>/dev/null; then
    {
      echo 'allow-loopback-pinentry'
      echo 'default-cache-ttl 86400'
      echo 'max-cache-ttl 604800'
    } >> "$GPG_AGENT_CONF"
  fi
  gpgconf --kill gpg-agent || true
fi

# If encrypted env exists and plaintext is missing, attempt decrypt (prefer AGE if available)
if [ ! -f "$ENV_FILE" ] && [ -f "${ENV_FILE}.enc" ]; then
  if command -v sops >/dev/null 2>&1; then
    echo "[info] decrypting $(basename "${ENV_FILE}.enc") -> $(basename "$ENV_FILE")"
    if [ -f /etc/vibrae/age.key ]; then
      SOPS_AGE_KEY_FILE=/etc/vibrae/age.key SOPS_CONFIG="$ROOT_DIR/.sops.yaml" sops --decrypt "${ENV_FILE}.enc" > "$ENV_FILE" || echo "[warn] sops decrypt failed with AGE"
    else
      # Force gpg to allow loopback in case key has passphrase
      if [ -f /etc/vibrae/gpg_pass ]; then
        SOPS_CONFIG="$ROOT_DIR/.sops.yaml" SOPS_GPG_EXEC="gpg --pinentry-mode loopback --passphrase-file /etc/vibrae/gpg_pass" sops --decrypt "${ENV_FILE}.enc" > "$ENV_FILE" || echo "[warn] sops decrypt failed (GPG passfile)"
      else
        SOPS_CONFIG="$ROOT_DIR/.sops.yaml" SOPS_GPG_EXEC="gpg --pinentry-mode loopback" sops --decrypt "${ENV_FILE}.enc" > "$ENV_FILE" || echo "[warn] sops decrypt failed; ensure GPG key is installed"
      fi
    fi
  else
    echo "[warn] sops not installed; cannot decrypt ${ENV_FILE}.enc"
  fi
fi

# Validate env and create if missing (seed sensible defaults)
mkdir -p "$(dirname "$ENV_FILE")" 2>/dev/null || true
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$ROOT_DIR/config/env/.env.backend.example" ]; then
    cp "$ROOT_DIR/config/env/.env.backend.example" "$ENV_FILE"
  else
    cat > "$ENV_FILE" <<'EOENV'
# Vibrae environment (Raspberry Pi)
BACKEND_PORT=8000
BACKEND_MODULE=apps.api.src.vibrae_api.main:app
FRONTEND_PORT=9081
FRONTEND_DIST=/apps/web/dist
MUSIC_MODE=folder
MUSIC_DIR=music
SECRET_KEY=change-me-please
LOG_LEVEL=INFO
EOENV
  fi
fi
missing=0
req(){ k="$1"; grep -qE "^${k}=" "$ENV_FILE" || { echo "[warn] missing $k in $(basename "$ENV_FILE")"; missing=$((missing+1)); }; }
req SECRET_KEY
req BACKEND_PORT
req FRONTEND_PORT
grep -qE '^BACKEND_MODULE=' "$ENV_FILE" || echo 'BACKEND_MODULE=apps.api.src.vibrae_api.main:app' >> "$ENV_FILE"
grep -qE '^FRONTEND_DIST=' "$ENV_FILE" || echo 'FRONTEND_DIST=/apps/web/dist' >> "$ENV_FILE"
grep -qE '^MUSIC_DIR=' "$ENV_FILE" || echo 'MUSIC_DIR=music' >> "$ENV_FILE"
grep -qE '^LOG_LEVEL=' "$ENV_FILE" || echo 'LOG_LEVEL=INFO' >> "$ENV_FILE"
[ $missing -gt 0 ] && echo "[warn] $missing required env value(s) missing; please edit $ENV_FILE"

cat > /etc/systemd/system/vibrae-backend.service <<UNIT
[Unit]
Description=Vibrae Backend (FastAPI/Uvicorn)
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$ROOT_DIR/config/env/.env.backend
Environment=PYTHONPATH=$ROOT_DIR:$ROOT_DIR/packages/core/src
ExecStart=$ROOT_DIR/venv/bin/uvicorn ${BACKEND_MODULE:-apps.api.src.vibrae_api.main:app} --host 0.0.0.0 --port ${BACKEND_PORT:-8000}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/vibrae-frontend.service <<UNIT
[Unit]
Description=Vibrae Frontend Static Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$ROOT_DIR/config/env/.env.backend
ExecStart=/usr/bin/env npx serve -s "$ROOT_DIR${FRONTEND_DIST:-/apps/web/dist}" -l ${FRONTEND_PORT:-9081}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/vibrae-cloudflared.service <<UNIT
[Unit]
Description=Vibrae Cloudflared Tunnel
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$ROOT_DIR/config/env/.env.backend
ExecStart=/usr/bin/env cloudflared tunnel run --protocol http2 --token ${CLOUDFLARE_TUNNEL_TOKEN}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

# Auto-update unit & timer (pull latest and restart services)
cat > /etc/systemd/system/vibrae-update.service <<UNIT
[Unit]
Description=Vibrae Auto Update (git pull + reinstall + restart)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
WorkingDirectory=$ROOT_DIR
EnvironmentFile=$ROOT_DIR/config/env/.env.backend
ExecStart=/bin/bash $ROOT_DIR/scripts/pi/update.sh
User=root

[Install]
WantedBy=multi-user.target
UNIT

cat > /etc/systemd/system/vibrae-update.timer <<UNIT
[Unit]
Description=Run Vibrae Auto Update periodically

[Timer]
OnBootSec=2min
OnUnitActiveSec=10min
AccuracySec=1min
Persistent=true

[Install]
WantedBy=timers.target
UNIT

echo "[info] enable and start services"
systemctl daemon-reload
systemctl enable vibrae-backend.service || true
ENABLE_FRONT=0
FRONT_DIR="$ROOT_DIR${FRONTEND_DIST:-/apps/web/dist}"
if command -v npx >/dev/null 2>&1 && [ -d "$FRONT_DIR" ]; then
  ENABLE_FRONT=1
  systemctl enable vibrae-frontend.service || true
else
  echo "[warn] frontend service disabled (missing npx or export at $FRONT_DIR)"
fi
if [ -n "${CLOUDFLARE_TUNNEL_TOKEN:-}" ]; then systemctl enable vibrae-cloudflared.service || true; fi
systemctl restart vibrae-backend.service || true
if [ "$ENABLE_FRONT" -eq 1 ]; then systemctl restart vibrae-frontend.service || true; fi
if systemctl is-enabled vibrae-cloudflared.service >/dev/null 2>&1; then
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "[info] installing cloudflared"
    ARCH=$(uname -m)
    PKG=""
    case "$ARCH" in
      aarch64|arm64) PKG="cloudflared-linux-arm64.deb" ;;
      armv7l|armhf)  PKG="cloudflared-linux-armhf.deb" ;;
      *) PKG="" ;;
    esac
    if [ -n "$PKG" ]; then
      curl -fsSL "https://github.com/cloudflare/cloudflared/releases/latest/download/$PKG" -o /tmp/cloudflared.deb || true
      dpkg -i /tmp/cloudflared.deb || true
    else
      echo "[warn] unsupported arch $ARCH for prebuilt cloudflared; please install manually"
    fi
  fi
  systemctl restart vibrae-cloudflared.service || true
fi

# Enable updater timer
systemctl enable vibrae-update.timer || true
systemctl start vibrae-update.timer || true

# Mark installation completed
STAMP_FILE="$ROOT_DIR/.installed"
date +'installed_at=%Y-%m-%dT%H:%M:%S%z' > "$STAMP_FILE" 2>/dev/null || true
echo "venv=$ROOT_DIR/venv" >> "$STAMP_FILE" 2>/dev/null || true
echo "python=$($ROOT_DIR/venv/bin/python -V 2>/dev/null | tr -d '\n')" >> "$STAMP_FILE" 2>/dev/null || true
echo "platform=raspi" >> "$STAMP_FILE" 2>/dev/null || true

echo "[info] configure nginx site"
SITE_DST="/etc/nginx/sites-available/vibrae.conf"
if command -v envsubst >/dev/null 2>&1; then
  BACKEND_PORT="${BACKEND_PORT:-8000}" FRONTEND_PORT="${FRONTEND_PORT:-9081}" DOMAIN="${DOMAIN:-_}" \
    envsubst '${DOMAIN} ${BACKEND_PORT} ${FRONTEND_PORT}' < "$ROOT_DIR/nginx.conf" > "$SITE_DST"
else
  cp "$ROOT_DIR/nginx.conf" "$SITE_DST"
fi
ln -sf "$SITE_DST" /etc/nginx/sites-enabled/vibrae.conf
nginx -t && systemctl restart nginx || echo "[warn] nginx config test failed"

# Optional: configure passwordless sudo for the invoking user (limited commands)
if [ "${VIBRAE_SUDOERS:-0}" = "1" ] && [ -n "${SUDO_USER:-}" ]; then
  echo "[info] configuring passwordless sudo for user $SUDO_USER (limited Vibrae commands)"
  SUDOERS_FILE="/etc/sudoers.d/vibrae-$SUDO_USER"
  SYSTEMCTL_PATH="$(command -v systemctl || echo /bin/systemctl)"
  JOURNALCTL_PATH="$(command -v journalctl || echo /bin/journalctl)"
  cat > "$SUDOERS_FILE" <<SUDO
Cmnd_Alias VIBRAE_CMDS = \
  $SYSTEMCTL_PATH start vibrae-*, \
  $SYSTEMCTL_PATH stop vibrae-*, \
  $SYSTEMCTL_PATH restart vibrae-*, \
  $SYSTEMCTL_PATH status vibrae-*, \
  $SYSTEMCTL_PATH start nginx, \
  $SYSTEMCTL_PATH stop nginx, \
  $SYSTEMCTL_PATH restart nginx, \
  $SYSTEMCTL_PATH status nginx, \
  $JOURNALCTL_PATH -u vibrae-*, \
  $JOURNALCTL_PATH -u nginx, \
  /bin/bash $ROOT_DIR/scripts/pi/setup.sh, \
  /bin/bash $ROOT_DIR/scripts/pi/run.sh, \
  /bin/bash $ROOT_DIR/scripts/pi/stop.sh
$SUDO_USER ALL=(root) NOPASSWD: VIBRAE_CMDS
SUDO
  chmod 0440 "$SUDOERS_FILE" || true
fi

echo "[ok] Raspberry Pi setup complete. Services: vibrae-backend, vibrae-frontend, vibrae-cloudflared"