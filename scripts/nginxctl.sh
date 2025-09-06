#!/bin/bash
# nginx control wrapper
# Usage: nginxctl.sh start <conf> | stop
set -euo pipefail
cmd="${1:-}"
case "$cmd" in
  start)
    conf="${2:-/usr/local/etc/nginx/nginx.conf}"
    exec nginx -c "$conf"
    ;;
  stop)
    exec nginx -s stop
    ;;
  *)
    echo "usage: $0 start <conf>| stop" >&2
    exit 2
    ;;
 esac
