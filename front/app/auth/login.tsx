// app/(auth)/Login.tsx
import React, { JSX, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Ionicons } from "@expo/vector-icons";
import { styles as authStyles } from "../../assets/styles/auth.styles";
import { styles as homeStyles } from "../../assets/styles/home.styles"; // <- reutilizamos balanceCard
import { COLORS } from "../../constants/Colors";
import { getToken, saveToken } from "../../lib/storage";
import { API_URL } from "@env";

export default function Login(): JSX.Element {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Rate-limit simple
  const [lastAttemptTime, setLastAttemptTime] = useState<number | null>(null);
  const RATE_LIMIT_MS = 1200;

  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/users/validate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) router.replace("/tabs/home");
      } catch (e) {
        // ignore
      }
    })();
  }, []);

  const onSignInPress = async () => {
    const now = Date.now();
    if (lastAttemptTime && now - lastAttemptTime < RATE_LIMIT_MS) {
      setError("Espera un momento antes de intentarlo de nuevo.");
      return;
    }
    if (!username.trim() || !password.trim()) {
      setError("Por favor completa todos los campos.");
      return;
    }

    setLastAttemptTime(now);
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.detail || "Credenciales incorrectas.");
        setLoading(false);
        return;
      }

      await saveToken(data.access_token);
      router.replace("/tabs/home");
    } catch (err) {
      console.error("Login error:", err);
      setError("Fallo del servidor.");
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = username.trim().length > 0 && password.trim().length > 0 && !loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1 }} enableOnAndroid enableAutomaticScroll extraScrollHeight={30}>
        <View style={authStyles.container}>
          {/* Reutilizamos balanceCard de Home para que la caja sea idéntica */}
          <View style={[homeStyles.balanceCard, { width: "100%", maxWidth: 560 }]}>
            <Text style={authStyles.title}>¡Bienvenido!</Text>
            <Text style={authStyles.subtitle}>Inicia sesión para hacer magia en el jardín</Text>

            {error ? (
              <View style={authStyles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={COLORS.expense} />
                <Text style={authStyles.errorText}>{error}</Text>
                <TouchableOpacity onPress={() => setError("")}>
                  <Ionicons name="close" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              </View>
            ) : null}

            <TextInput
              style={[authStyles.input, error ? authStyles.errorInput : null]}
              value={username}
              onChangeText={setUsername}
              placeholder="Usuario"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <TextInput
              style={[authStyles.input, error ? authStyles.errorInput : null]}
              value={password}
              onChangeText={setPassword}
              placeholder="Contraseña"
              placeholderTextColor={COLORS.textLight}
              secureTextEntry
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[authStyles.button, !canSubmit ? { opacity: 0.6 } : null]}
              onPress={onSignInPress}
              disabled={!canSubmit}
              accessibilityLabel="Iniciar Sesión"
            >
              {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={authStyles.buttonText}>Iniciar Sesión</Text>}
            </TouchableOpacity>
            {/* TODO: página creación de usuario
            <View style={authStyles.footerContainer}>
              <Text style={authStyles.footerText}>¿No tienes login?</Text>
              <TouchableOpacity onPress={() => router.push("/auth/register")}>
                <Text style={authStyles.linkText}> Crear cuenta</Text>
              </TouchableOpacity>
            </View>
            */}
          </View>
        </View>
      </KeyboardAwareScrollView>

      <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "center", backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.textLight, fontSize: 12 }}>Made with ❤️ by Dani Callero</Text>
      </View>
    </SafeAreaView>
  );
}
