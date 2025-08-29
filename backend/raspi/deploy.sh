#!/bin/bash
# SPDX-License-Identifier: GPL-3.0-or-later
set -euo pipefail

# Raspberry Pi deployment helper: installs deps, sets up systemd services.

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

if ! command -v python3 >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y python3 python3-venv python3-dev build-essential ffmpeg
fi

cd "$ROOT_DIR"
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# Optional: build web on Pi (skip if already exported)
if [ ! -d "front/dist" ]; then
  echo "[warn] front/dist missing. Copy from dev machine for faster deploy."
fi

cat > /tmp/vibrae.service <<'UNIT'
[Unit]
Description=Vibrae Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=__ROOT__
EnvironmentFile=__ROOT__/.env
ExecStart=__ROOT__/venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port ${BACKEND_PORT:-8000}
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT

sed -i "s#__ROOT__#${ROOT_DIR}#g" /tmp/vibrae.service
sudo mv /tmp/vibrae.service /etc/systemd/system/vibrae.service
sudo systemctl daemon-reload
sudo systemctl enable vibrae.service
sudo systemctl restart vibrae.service

echo "[ok] Vibrae deployed. Check: sudo journalctl -u vibrae -f"
