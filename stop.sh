#!/bin/bash
# Stop serve static server (robust)
pkill -f "npx serve"
pkill -f "serve -s"
pkill -f "node.*serve"

# Stop FastAPI backend
pkill -f "uvicorn"

# Stop Cloudflare Tunnel
pkill -f "cloudflared"

# Stop nginx (macOS)
if [[ "$(uname)" == "Darwin" ]]; then
  echo "Stopping nginx (macOS)..."
  sudo nginx -s stop
else
  # Stop nginx (Linux)
  echo "Stopping nginx (Linux)..."
  sudo systemctl stop nginx
fi

echo "All Vibrae services stopped."
