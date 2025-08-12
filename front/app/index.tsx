import { useEffect } from "react";
import { useRouter, useRootNavigationState } from "expo-router";
import { View, ActivityIndicator } from "react-native";
import { getToken, deleteToken } from "../lib/storage";
import { API_URL } from "@env";

export default function Index() {
  const router = useRouter();
  const navState = useRootNavigationState();

  useEffect(() => {
    if (!navState?.key) return;

    (async () => {
      const token = await getToken();

      if (!token) {
        router.replace("/auth/login");
        return;
      }

      try {
        const res = await fetch(`${API_URL}/users/validate`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!res.ok) {
          throw new Error("Token no válido");
        }

        console.log("Token válido, redirigiendo a home");

        router.replace("/tabs/home");
      } catch (err) {
        console.warn("Token inválido:", err);
        await deleteToken(); // limpia storage
        router.replace("/auth/login");
      }
    })();
  }, [navState]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <ActivityIndicator size="large" />
    </View>
  );
}
