// SPDX-License-Identifier: GPL-3.0-or-later
// app/auth/login.tsx

import React, { JSX, useEffect, useState } from "react";
import { useRouter } from "expo-router";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Platform,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import { Ionicons } from "@expo/vector-icons";
import { styles as authStyles } from "../../assets/styles/auth.styles";
import { styles as homeStyles } from "../../assets/styles/home.styles";
import { COLORS } from "../../constants/Colors";
import { getToken, saveToken } from "../../lib/storage";
import { API_URL } from "@env";

export default function Login(): JSX.Element {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [repeatPassword, setRepeatPassword] = useState("");
  const [adminToken, setAdminToken] = useState("");

  const [loginError, setLoginError] = useState("");
  const [registerError, setRegisterError] = useState("");

  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);

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
      }
    })();
  }, []);

  const onSignInPress = async () => {
    const now = Date.now();
    if (lastAttemptTime && now - lastAttemptTime < RATE_LIMIT_MS) {
      setLoginError("Espera un momento antes de intentarlo de nuevo.");
      return;
    }

    if (!username.trim() || !password.trim()) {
      setLoginError("Por favor completa todos los campos.");
      return;
    }

    setLastAttemptTime(now);
    setLoading(true);
    setLoginError("");

    try {
      const res = await fetch(`${API_URL}/users/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setLoginError(data.detail || "Credenciales incorrectas.");
        setLoading(false);
        return;
      }

      await saveToken(data.access_token);
      router.replace("/tabs/home");
    } catch (err) {
      console.error("Login error:", err);
      setLoginError("Fallo del servidor.");
    } finally {
      setLoading(false);
    }
  };

  const onCreateAccountPress = async () => {
    if (!adminToken.trim() || !newUsername.trim() || !newPassword.trim() || !repeatPassword.trim()) {
      setRegisterError("Por favor completa todos los campos.");
      return;
    }
    if (newPassword !== repeatPassword) {
      setRegisterError("Las contraseñas no coinciden.");
      return;
    }

    setLoading(true);
    setRegisterError("");

    try {
      const res = await fetch(`${API_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          admin_token: adminToken,
        }),
      });

      const data = await res.json().catch(() => ({} as any));

      if (!res.ok) {
        setRegisterError(data.detail || "Error al crear la cuenta.");
        setLoading(false);
        return;
      }

      setNewUsername("");
      setNewPassword("");
      setRepeatPassword("");
      setAdminToken("");
      setRegisterError("");
      setShowModal(false);
    } catch (err) {
      console.error("Create account error:", err);
      setRegisterError("Fallo del servidor.");
    } finally {
      setLoading(false);
    }
  };

  const canLogin = username.trim().length > 0 && password.trim().length > 0 && !loading;
  const canRegister =
    newUsername.trim().length > 0 &&
    newPassword.trim().length > 0 &&
    repeatPassword.trim().length > 0 &&
    adminToken.trim().length > 0 &&
    !loading;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
      <KeyboardAwareScrollView contentContainerStyle={{ flexGrow: 1 }} enableOnAndroid enableAutomaticScroll extraScrollHeight={30}>
        <View style={[authStyles.container, { justifyContent: "center" }]}>
          <View style={[homeStyles.balanceCard, { width: "100%", maxWidth: 560 }]}>
            <Image
              source={require("../../assets/images/logo.png")}
              style={{ width: 120, height: 120, marginBottom: 5, resizeMode: "contain", alignSelf: "center" }}
            />
            <Text style={authStyles.title}>¡Bienvenido!</Text>
            <Text style={authStyles.subtitle}>Inicia sesión para hacer magia en el jardín</Text>

            {loginError ? (
              <View style={authStyles.errorBox}>
                <Ionicons name="alert-circle" size={18} color={COLORS.expense} />
                <Text style={authStyles.errorText}>{loginError}</Text>
                <TouchableOpacity onPress={() => setLoginError("")}>
                  <Ionicons name="close" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              </View>
            ) : null}

            <TextInput
              style={[authStyles.input, loginError ? authStyles.errorInput : null]}
              value={username}
              onChangeText={setUsername}
              placeholder="Usuario"
              placeholderTextColor={COLORS.textLight}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <TextInput
              style={[authStyles.input, loginError ? authStyles.errorInput : null]}
              value={password}
              onChangeText={setPassword}
              placeholder="Contraseña"
              placeholderTextColor={COLORS.textLight}
              secureTextEntry
              returnKeyType="done"
            />

            <TouchableOpacity
              style={[authStyles.button, !canLogin ? { opacity: 0.6 } : null]}
              onPress={onSignInPress}
              disabled={!canLogin}
              accessibilityLabel="Iniciar Sesión"
            >
              {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={authStyles.buttonText}>Iniciar Sesión</Text>}
            </TouchableOpacity>

            <View style={authStyles.footerContainer}>
              <Text style={authStyles.footerText}>¿No tienes login?</Text>
              <Text style={authStyles.linkText} onPress={() => { setShowModal(true); setRegisterError(""); }}>
                Crear cuenta
              </Text>
            </View>
          </View>
        </View>

        <Modal visible={showModal} animationType="slide" transparent={true}>
          <View style={authStyles.modalOverlay}>
            <View style={authStyles.creationContainer}>
              <Text style={authStyles.creationTitle}>Crear cuenta</Text>

              {registerError ? (
                <View style={authStyles.errorBox}>
                  <Ionicons name="alert-circle" size={18} color={COLORS.expense} />
                  <Text style={authStyles.errorText}>{registerError}</Text>
                  <TouchableOpacity onPress={() => setRegisterError("")}>
                    <Ionicons name="close" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                </View>
              ) : null}

              <TextInput
                style={[authStyles.input, registerError ? authStyles.errorInput : null]}
                value={adminToken}
                onChangeText={setAdminToken}
                placeholder="Admin Token"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry
                returnKeyType="next"
              />

              <TextInput
                style={[authStyles.input, registerError ? authStyles.errorInput : null]}
                value={newUsername}
                onChangeText={setNewUsername}
                placeholder="Usuario"
                placeholderTextColor={COLORS.textLight}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
              />

              <TextInput
                style={[authStyles.input, registerError ? authStyles.errorInput : null]}
                value={newPassword}
                onChangeText={setNewPassword}
                placeholder="Contraseña"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry
                returnKeyType="next"
              />

              <TextInput
                style={[authStyles.input, registerError ? authStyles.errorInput : null]}
                value={repeatPassword}
                onChangeText={setRepeatPassword}
                placeholder="Repetir contraseña"
                placeholderTextColor={COLORS.textLight}
                secureTextEntry
                returnKeyType="done"
              />

              <View style={authStyles.modalActions}>
                <TouchableOpacity
                  style={[authStyles.button, !canRegister ? { opacity: 0.6 } : null]}
                  onPress={onCreateAccountPress}
                  disabled={!canRegister}
                  accessibilityLabel="Crear Cuenta"
                >
                  {loading ? <ActivityIndicator color={COLORS.white} /> : <Text style={authStyles.buttonText}>Crear Cuenta</Text>}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[authStyles.button, { backgroundColor: COLORS.expense, opacity: 0.8 }]}
                  onPress={() => { setShowModal(false); setRegisterError(""); }}
                  accessibilityLabel="Cancelar"
                >
                  <Text style={authStyles.buttonText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </KeyboardAwareScrollView>

      <View style={{ paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, alignItems: "center", backgroundColor: COLORS.background }}>
        <Text style={{ color: COLORS.textLight, fontSize: 12 }}>Made with ❤️ by Dani Callero</Text>
      </View>
    </SafeAreaView>
  );
}
