#!/bin/bash
set -e
source venv/bin/activate
# Export env vars from .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# Start frontend SPA server in background, log to frontend.log
#echo "Starting frontend server on port 8080..."
#python serve_spa.py > frontend.log 2>&1 &

# Start backend API, log to backend.log
echo "Starting backend API on port 8000..."
uvicorn backend.main:app --host 0.0.0.0 --port 8000
#uvicorn backend.main:app --host 0.0.0.0 --port 8000 > backend.log 2>&1