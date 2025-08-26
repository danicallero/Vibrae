// SPDX-License-Identifier: GPL-3.0-or-later
// app/tabs/_layout.tsx

import { Stack, Slot } from "expo-router";

export default function TabsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Slot />
    </Stack>  );
}
