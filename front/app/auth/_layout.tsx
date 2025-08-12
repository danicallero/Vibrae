import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Slot, useRouter } from "expo-router";
import { getToken } from "../../lib/storage";
import { API_URL } from "@env";

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

      const res = await fetch(`${API_URL}/users/validate`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
        },
      });

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

  return <Slot />;
}
