#!/bin/bash
# Start Vibrae services on Raspberry Pi (systemd)
set -euo pipefail
if [ "$(id -u)" -ne 0 ]; then echo "[err ] please run as root (sudo)" >&2; exit 1; fi
systemctl start vibrae-backend.service || true
systemctl start vibrae-frontend.service || true
systemctl start vibrae-cloudflared.service || true
echo "[ok] started (check: systemctl status vibrae-* )"
