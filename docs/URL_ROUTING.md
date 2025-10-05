# Vibrae URL Routing - Single Port Architecture

## How It Works

**Single URL for everything**: `http://localhost` (port 80)

Nginx intelligently routes based on the **path**:

```
http://localhost/             → Frontend (static files)
http://localhost/.../...      → Frontend (SPA routing)
http://localhost/api/...      → Backend API
http://localhost/ws/...       → Backend WebSocket
```

## Routing Logic

```nginx
server {
    listen 80;
    server_name localhost;
    root /path/to/apps/web/dist;  # Frontend files

    # Rule 1: API endpoints → Backend
    location /api/ {
        proxy_pass http://backend:8000;
    }

    # Rule 2: WebSocket → Backend  
    location /ws {
        proxy_pass http://backend:8000;
    }

    # Rule 3: Everything else → Frontend
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

## Request Flow Examples

### Frontend Request
```
User visits: http://localhost/dashboard
             ↓
Nginx checks: Does /dashboard match /api/* or /ws? NO
             ↓
Nginx serves: apps/web/dist/index.html (SPA handles /dashboard)
             ↓
React Router: Loads Dashboard component
```

### API Request
```
App makes: http://localhost/api/scenes
           ↓
Nginx checks: Does /api/scenes match /api/*? YES
           ↓
Nginx proxies to: http://backend:8000/api/scenes
           ↓
FastAPI: Returns JSON data
```

### WebSocket Request
```
App connects: ws://localhost/ws
              ↓
Nginx checks: Does /ws match /ws? YES
              ↓
Nginx upgrades connection to: ws://backend:8000/ws
              ↓
Backend: WebSocket connection established
```

### Static Asset Request
```
Browser loads: http://localhost/assets/logo.png
               ↓
Nginx checks: Does /assets/logo.png match /api/* or /ws? NO
               ↓
Nginx serves: apps/web/dist/assets/logo.png (direct from filesystem)
               ↓
Browser: Displays image
```

## Benefits of This Approach

### ✅ Single Origin
- No CORS issues (everything from `localhost`)
- Simpler configuration
- Better for cookies/sessions

### ✅ Clean URLs
```
http://localhost                  # Clean, professional
http://localhost/api/users/login  # API clearly namespaced
```

Not this:
```
http://localhost:9081         # Frontend on different port
http://localhost:8000/api     # Backend on different port
```

### ✅ Production-Ready
This is the **standard architecture** for production:
- Same pattern as `example.com/` (frontend) + `example.com/api/` (backend)
- Works identically in development and production
- No port juggling

### ✅ Transparent to Users
Users only see:
```
http://localhost/
```

They don't need to know about:
- Backend running on :8000
- Multiple services
- Complex routing

## URL Structure

```
http://localhost/
├── /                    → Frontend (React/Expo SPA)
│   ├── /login          → Frontend route
│   ├── /dashboard      → Frontend route
│   ├── /scenes         → Frontend route
│   └── /routines       → Frontend route
│
├── /api/               → Backend API (FastAPI)
│   ├── /api/auth       → Authentication endpoints
│   ├── /api/scenes     → Scene management
│   ├── /api/routines   → Routine management
│   └── /api/player     → Player control
│
├── /ws                 → WebSocket (real-time updates)
│
├── /assets/            → Frontend static assets
│   ├── /assets/images
│   └── /assets/fonts
│
└── /health             → Health check endpoint
```

## Configuration Summary

**Current Setup** (what you have now):
```
Port 80 (nginx):
├── /api/*  → proxy to :8000 (backend)
├── /ws     → proxy to :8000 (websocket)
└── /*      → serve from filesystem (frontend)

Port 8000 (backend): Not exposed externally
Port 9081 (npx serve): NOT RUNNING (nginx serves directly)
```

**What Users See**:
```
Everything at http://localhost/
```

## Code Example

### Frontend (React/Expo)
```javascript
// All requests to same origin - no CORS!
fetch('/api/scenes')  // Goes to backend automatically
  .then(res => res.json())

// WebSocket also same origin
const ws = new WebSocket('ws://localhost/ws')
```

### Backend (FastAPI)
```python
# Backend runs on :8000 but users don't see it
# Nginx forwards /api/* to here

@app.get("/api/scenes")
def get_scenes():
    return {"scenes": [...]}
```

## Testing

```bash
# Start everything
./vibrae up

# All these use the same URL (localhost:80)
curl http://localhost/                    # → Frontend HTML
curl http://localhost/api/scenes          # → Backend API
curl http://localhost/health              # → Health check

# Browser just uses
http://localhost/
```

## Comparison

### ❌ Old Way (Multiple Ports)
```
Frontend:  http://localhost:9081
Backend:   http://localhost:8000/api
WebSocket: ws://localhost:8000/ws

Problems:
- CORS configuration needed
- Different URLs for dev/prod
- Confusing for users
- Cookie issues across ports
```

### ✅ New Way (Single Port)
```
Everything: http://localhost/
            ├── /          → Frontend
            ├── /api/*     → Backend
            └── /ws        → WebSocket

Benefits:
- No CORS issues
- Same URL structure always
- Professional
- Production-ready
```

## Summary

Your setup is **exactly right**:
- ✅ Single URL (`http://localhost`)
- ✅ `/api/*` routes to backend
- ✅ `/ws` routes to websocket
- ✅ Everything else routes to frontend
- ✅ No port numbers in URLs
- ✅ No CORS issues
- ✅ Production-ready architecture

This is the **standard, recommended way** to structure a modern web application!
