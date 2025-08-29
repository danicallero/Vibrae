// SPDX-License-Identifier: GPL-3.0-or-later
// lib/config.ts
import { API_URL, EXPO_PUBLIC_API_URL } from "@env";

// Decide the API base at runtime:
// - When running on web behind our nginx proxy or any domain: use same-origin "/api".
// - When opening the static site directly via a dev/serve port on localhost: use http://localhost:<BACKEND_PORT>.
// - On native (iOS/Android): use EXPO_PUBLIC_API_URL or API_URL, falling back to http://localhost:8000.
export function getApiBase(): string {
  // Web (browser) detection
  if (typeof window !== "undefined" && typeof document !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port;
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local");
    // If served via a non-80/443 port on localhost (e.g., npx serve), talk to backend directly on its port
    if (isLocal && port && port !== "80" && port !== "443") {
      const proto = window.location.protocol.startsWith("https") ? "https" : "http";
      const backPort = (process?.env as any)?.EXPO_PUBLIC_BACKEND_PORT || "8000";
      return `${proto}://localhost:${backPort}`;
    }
    // Otherwise we expect nginx to proxy /api → backend
    return "/api";
  }
  // Native fallback
  const envUrl = (EXPO_PUBLIC_API_URL || API_URL || "").trim();
  return envUrl || "http://localhost:8000";
}

export function buildApiUrl(path: string): string {
  // Absolute URL
  if (/^https?:\/\//i.test(path)) return path;
  const base = getApiBase();
  const p = path.startsWith("/") ? path : `/${path}`;
  if (base.startsWith("/")) {
    // same-origin base like "/api"
    return `${base}${p}`;
  }
  return `${base}${p}`;
}

export function getWebSocketUrl(path: string): string {
  // Build an absolute ws:// or wss:// URL for a websocket endpoint under the API
  const httpUrl = buildApiUrl(path);
  if (httpUrl.startsWith("/")) {
    if (typeof window !== "undefined") {
      const scheme = window.location.protocol === "https:" ? "wss" : "ws";
      return `${scheme}://${window.location.host}${httpUrl}`;
    }
    return httpUrl; // best-effort
  }
  return httpUrl.replace(/^http/i, "ws");
}
