// SPDX-License-Identifier: GPL-3.0-or-later
// app/auth/_layout.tsx

import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Slot, useRouter, Stack } from "expo-router";
import { getToken } from "../../lib/storage";
import { apiFetch } from "../../lib/api";

export default function AuthLayout() {
  const [checking, setChecking] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const check = async () => {
      const token = await getToken();
      if (!token) {
        setChecking(false); // allow access
        return;
      }

  const res = await apiFetch("/users/validate", { method: "POST" });

      if (res.ok) {
        router.replace("/tabs/home");
      } else {
        setChecking(false); // show login
      }
    };

    check();
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
