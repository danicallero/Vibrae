import { useRouter } from "expo-router";
import { Text, TextInput, TouchableOpacity, View, Image, Alert } from "react-native";
import { useState, useEffect } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Ionicons } from "@expo/vector-icons";
import { COLORS } from "../../constants/Colors";
import { getToken, saveToken, deleteToken } from "../../lib/storage";
import { styles } from "../../assets/styles/auth.styles";
import { API_URL } from '@env';
import { SafeAreaView } from "react-native-safe-area-context";


export default function Page() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // If already logged in, redirect to /tabs/home
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/users/validate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          router.replace("/tabs/home");
        }
      } catch { }
    })();
  }, []);

  const [lastAttemptTime, setLastAttemptTime] = useState<number | null>(null);
  const RATE_LIMIT_MS = 2000; // 2 seconds

  const onSignInPress = async () => {
    const now = Date.now();

    if (lastAttemptTime && now - lastAttemptTime < RATE_LIMIT_MS) {
      setError("Espera un momento antes de intentarlo de nuevo.");
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError("Por favor, completa todos los campos.");
      return;
    }

    setLastAttemptTime(now); // set this before the request

    try {
      const response = await fetch(`${API_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });


      const data = await response.json();

      if (!response.ok) {
        setError(data.detail || "Credenciales incorrectos.");
        return;
      }

      await saveToken(data.access_token);
      router.replace("/tabs/home");
    } catch (err) {
      console.error("Login error:", err);
      setError("Fallo del servidor.");
    }
  };



  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1 }}
        enableOnAndroid={true}
        enableAutomaticScroll={true}
        extraScrollHeight={30}
      >
        <View style={styles.container}>
          <Text style={styles.title}>¡Bienvenido!</Text>

          <Text style={styles.subtitle}>
            Inicia sesión para hacer magia en el jardín
          </Text>

          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="alert-circle" size={20} color={COLORS.expense} />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => setError("")}>
                <Ionicons name="close" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>
          ) : null}

          <TextInput
            style={[styles.input, error && styles.errorInput]}
            autoCapitalize="none"
            value={username}
            placeholder="Usuario"
            placeholderTextColor="#9A8478"
            onChangeText={setUsername}
          />

          <TextInput
            style={[styles.input, error && styles.errorInput]}
            value={password}
            placeholder="Contraseña"
            placeholderTextColor="#9A8478"
            secureTextEntry={true}
            onChangeText={setPassword}
          />

          <TouchableOpacity style={styles.button} onPress={onSignInPress}>
            <Text style={styles.buttonText}>Iniciar Sesión</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAwareScrollView>
            <View
        style={{
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: COLORS.border,
          alignItems: "center",
          backgroundColor: COLORS.background,
        }}
      >
        <Text style={{ color: COLORS.textLight, fontSize: 12 }}>
          Made with ❤️ by Dani Callero
        </Text>
      </View>
    </SafeAreaView>
  );
}
