// SPDX-License-Identifier: GPL-3.0-or-later
// lib/api.ts
import { router } from "expo-router";
import { getToken, deleteToken } from "./storage";
import { buildApiUrl } from "./config";

/**
 * fetch with Authorization header automatically.
 * On missing token or 401 response, clears token and redirects to /auth/login.
 */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  if (!token) {
    // No token: go to login and reject
    try { await deleteToken(); } catch {}
  try { router.replace("/auth/login"); } catch {}
    throw new Error("No auth token");
  }

  const headers: Record<string, any> = {};
  // Normalize provided headers (may be Headers, array, or object)
  if (init.headers instanceof Headers) {
    init.headers.forEach((v, k) => { headers[k] = v; });
  } else if (Array.isArray(init.headers)) {
    for (const [k, v] of init.headers as any[]) headers[k] = v;
  } else if (init.headers) {
    Object.assign(headers, init.headers as Record<string, any>);
  }
  headers["Authorization"] = `Bearer ${token}`;

  const url = buildApiUrl(input);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    try { await deleteToken(); } catch {}
  try { router.replace("/auth/login"); } catch {}
    throw new Error("Unauthorized (401)");
  }
  return res;
}

export { buildApiUrl };
