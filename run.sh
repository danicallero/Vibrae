#!/bin/bash
set -e

# Activate Python venv if exists
if [ -d venv ]; then
  source venv/bin/activate
fi

# Export env vars from .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Start frontend (SPA static server)
echo "Starting frontend on port "$FRONTEND_PORT"..."
cd "$(dirname "$0")$FRONTEND_DIST"
nohup npx serve -s . -l $FRONTEND_PORT > ../../serve.log 2>&1 &
cd ../../

# Start backend API
echo "Starting backend API on port "$BACKEND_PORT"..."
nohup uvicorn $BACKEND_MODULE --host 0.0.0.0 --port $BACKEND_PORT > backend.log 2>&1 &

# Detect OS and start nginx appropriately, rendering config from template with env vars
OS_TYPE=$(uname)
if [[ "$OS_TYPE" == "Darwin" ]]; then
  echo "Detected macOS. Starting nginx with custom config..."
  # Render nginx config with env vars into a temp file
  if command -v envsubst >/dev/null 2>&1; then
    # macOS mktemp requires -t with a prefix; it outputs a unique file path
    RENDERED_NGINX_CONF=$(mktemp -t nginx.vibrae)
    # Only substitute our own variables to avoid touching nginx runtime vars like $host
    envsubst '${DOMAIN} ${BACKEND_PORT} ${FRONTEND_PORT}' < "$NGINX_CONF" > "$RENDERED_NGINX_CONF"
    sudo nginx -c "$RENDERED_NGINX_CONF"
  else
    echo "Warning: envsubst not found. Using nginx.conf as-is."
    sudo nginx -c "$NGINX_CONF"
  fi
else
  echo "Detected Linux. Starting nginx via systemctl..."
  sudo systemctl start nginx
fi

# Start Cloudflare Tunnel
if [ -z "$CLOUDFLARE_TUNNEL_TOKEN" ]; then
  echo "Error: CLOUDFLARE_TUNNEL_TOKEN is not set in .env."
  exit 1
fi
echo "Starting Cloudflare Tunnel..."
nohup cloudflared tunnel run --protocol http2 --token "$CLOUDFLARE_TUNNEL_TOKEN" > cloudflared.log 2>&1 &

echo "All services started."