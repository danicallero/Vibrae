// SPDX-License-Identifier: GPL-3.0-or-later
// lib/storage.ts
import { Platform } from "react-native";

// Lazy require to avoid importing expo-secure-store during SSR/web
let SecureStore: any = null;
function loadSecureStore() {
  if (!SecureStore && Platform.OS !== "web") {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      SecureStore = require("expo-secure-store");
    } catch {
      SecureStore = null;
    }
  }
  return SecureStore;
}

const TOKEN_KEY = "access_token";

// Simple cookie helpers for web
function setCookie(name: string, value: string, days = 30) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  // SameSite=Lax so it survives normal navigations; Secure if page is https
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Expires=${expires}; Path=/; SameSite=Lax${secure}`;
}

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()\[\]\\/+^])/g, "\\$1") + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

function deleteCookie(name: string) {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; SameSite=Lax`;
}

export async function saveToken(token: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
    // Also write a cookie for robustness across navigations/CDN behaviors
    try { setCookie(TOKEN_KEY, token); } catch {}
  } else {
    const SS = loadSecureStore();
    if (SS?.setItemAsync) await SS.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    // Prefer cookie if available, else fall back to localStorage
    try {
      const fromCookie = getCookie(TOKEN_KEY);
      if (fromCookie) return fromCookie;
    } catch {}
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage.getItem(TOKEN_KEY);
    }
    return null;
  } else {
    const SS = loadSecureStore();
    if (SS?.getItemAsync) return await SS.getItemAsync(TOKEN_KEY);
    return null;
  }
}

export async function deleteToken() {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.removeItem(TOKEN_KEY);
    }
    try { deleteCookie(TOKEN_KEY); } catch {}
  } else {
    const SS = loadSecureStore();
    if (SS?.deleteItemAsync) await SS.deleteItemAsync(TOKEN_KEY);
  }
}
