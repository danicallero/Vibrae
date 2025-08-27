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

export async function saveToken(token: string) {
  if (Platform.OS === "web") {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(TOKEN_KEY, token);
    }
  } else {
    const SS = loadSecureStore();
    if (SS?.setItemAsync) await SS.setItemAsync(TOKEN_KEY, token);
  }
}

export async function getToken(): Promise<string | null> {
  if (Platform.OS === "web") {
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
  } else {
    const SS = loadSecureStore();
    if (SS?.deleteItemAsync) await SS.deleteItemAsync(TOKEN_KEY);
  }
}
