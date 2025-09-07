#!/bin/bash
# Vibrae Raspberry Pi setup — install deps, venv, systemd units, nginx site
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT_DIR/.env"

if [ "$(id -u)" -ne 0 ]; then
  echo "[err ] please run as root (sudo)" >&2; exit 1
fi

echo "[info] apt install dependencies"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
  python3 python3-venv python3-dev build-essential \
  nginx nodejs npm gettext-base curl ca-certificates \
  vlc || true

echo "[info] python venv + pip deps"
cd "$ROOT_DIR"
python3 -m venv venv
source venv/bin/activate
pip install -U pip wheel
pip install -r requirements.txt

echo "[info] frontend export (optional)"
if [ ! -d "$ROOT_DIR/front/dist" ]; then
  echo "[warn] front/dist not found. For best performance, copy a prebuilt export to front/dist." >&2
fi

echo "[info] create systemd units"
BACKEND_PORT=8000
FRONTEND_PORT=9081
if [ -f "$ENV_FILE" ]; then
  # shellcheck disable=SC1090
  set -a; . "$ENV_FILE"; set +a
fi

# Validate env and create if missing
if [ ! -f "$ENV_FILE" ]; then cp -n "$ROOT_DIR/.env.example" "$ENV_FILE" 2>/dev/null || true; fi
touch "$ENV_FILE"
missing=0
req(){ k="$1"; grep -qE "^${k}=" "$ENV_FILE" || { echo "[warn] missing $k in .env"; missing=$((missing+1)); }; }
req SECRET_KEY
req BACKEND_PORT
req FRONTEND_PORT
grep -qE '^BACKEND_MODULE=' "$ENV_FILE" || echo 'BACKEND_MODULE=backend.main:app' >> "$ENV_FILE"
grep -qE '^FRONTEND_DIST=' "$ENV_FILE" || echo 'FRONTEND_DIST=/front/dist' >> "$ENV_FILE"
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
EnvironmentFile=$ROOT_DIR/.env
Environment=PYTHONPATH=$ROOT_DIR
ExecStart=$ROOT_DIR/venv/bin/uvicorn \
  
  ${BACKEND_MODULE:-backend.main:app} --host 0.0.0.0 --port ${BACKEND_PORT:-8000}
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
EnvironmentFile=$ROOT_DIR/.env
ExecStart=/usr/bin/env npx serve -s "$ROOT_DIR${FRONTEND_DIST:-/front/dist}" -l ${FRONTEND_PORT:-9081}
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
EnvironmentFile=$ROOT_DIR/.env
ExecStart=/usr/bin/env cloudflared tunnel run --protocol http2 --token ${CLOUDFLARE_TUNNEL_TOKEN}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

echo "[info] enable and start services"
systemctl daemon-reload
systemctl enable vibrae-backend.service || true
ENABLE_FRONT=0
FRONT_DIR="$ROOT_DIR${FRONTEND_DIST:-/front/dist}"
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

echo "[ok] Raspberry Pi setup complete. Services: vibrae-backend, vibrae-frontend, vibrae-cloudflared"