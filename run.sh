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
echo "Starting frontend on port 9081..."
cd "$(dirname "$0")/front/dist"
nohup npx serve -s . -l 9081 > ../../serve.log 2>&1 &
cd ../../

# Start backend API
echo "Starting backend API on port 8000..."
nohup uvicorn backend.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1 &

# Detect OS and start nginx appropriately
OS_TYPE=$(uname)
if [[ "$OS_TYPE" == "Darwin" ]]; then
  echo "Detected macOS. Starting nginx with custom config..."
  sudo nginx -c /Users/dani/Documents/garden_music/nginx.conf
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