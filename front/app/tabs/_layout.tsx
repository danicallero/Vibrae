// SPDX-License-Identifier: GPL-3.0-or-later
// app/tabs/_layout.tsx

import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Stack, Slot } from "expo-router";
import { apiFetch } from "../../lib/api";

export default function TabsLayout() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Validate token; apiFetch will redirect on 401
  await apiFetch("/users/validate", { method: "POST" });
      } catch {
        // apiFetch already handled redirect
      } finally {
        if (mounted) setChecking(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Slot />
    </Stack>
  );
}
