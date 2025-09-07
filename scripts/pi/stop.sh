#!/bin/bash
# Stop Vibrae services on Raspberry Pi (systemd)
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "[err ] please run as root (sudo)" >&2; exit 1; fi
systemctl stop vibrae-cloudflared.service || true
systemctl stop vibrae-frontend.service || true
systemctl stop vibrae-backend.service || true
echo "[ok] stopped"
