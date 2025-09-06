#!/bin/bash
# cloudflared control wrapper
# Usage: cfctl.sh killall
set -euo pipefail
case "${1:-}" in
  killall)
    # Kill all cloudflared processes; use full paths if needed
    pkill -f cloudflared || true
    ;;
  *)
    echo "usage: $0 killall" >&2
    exit 2
    ;;
 esac
