import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
} from "react-native";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { styles } from "../../assets/styles/home.styles";
import { COLORS } from "../../constants/Colors";
import { API_URL } from "@env";
import { getToken, deleteToken } from "../../lib/storage";

export default function HomePage() {
  const router = useRouter();
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const [volume, setVolume] = useState<number>(50);
  const [loading, setLoading] = useState(true);
  const [shouldBePlaying, setShouldBePlaying] = useState(false);
  const [scheduleName, setScheduleName] = useState<string | null>(null);
  // Check if a schedule should be playing (for Resume button)
  const checkShouldBePlaying = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/schedule/`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });
      const routines = await res.json();
      const now = new Date();
      const nowStr = now.toTimeString().slice(0, 5);
      const weekday = now.toLocaleString("en-US", { weekday: "short" }).toLowerCase().slice(0, 3);
      const month = now.toLocaleString("en-US", { month: "short" }).toLowerCase().slice(0, 3);
      let found = false;
      let name = null;
      for (const routine of routines) {
        const start = routine.start_time;
        const end = routine.end_time;
        // Overnight support
        let inTime = false;
        if (start < end) {
          inTime = start <= nowStr && nowStr < end;
        } else {
          inTime = nowStr >= start || nowStr < end;
        }
        if (!inTime) continue;
        // Weekday check
        if (routine.weekdays) {
          const weekdays = routine.weekdays.split(',').map((w: string) => w.trim().toLowerCase().slice(0, 3)).filter(Boolean);
          if (!weekdays.includes(weekday)) continue;
        }
        // Month check
        if (routine.months) {
          const months = routine.months.split(',').map((m: string) => m.trim().toLowerCase().slice(0, 3)).filter(Boolean);
          if (!months.includes(month)) continue;
        }
        found = true;
        name = routine.name || `Escena ${routine.scene_id}`;
        break;
      }
      setShouldBePlaying(found);
      setScheduleName(name);
      setLoading(false);
    } catch {
      setShouldBePlaying(false);
      setLoading(false);
      setScheduleName(null);
    }
  }, []);
  const volumeShared = useSharedValue(volume);
  const min = useSharedValue(0);
  const max = useSharedValue(100);
  const wsRef = useRef<WebSocket | null>(null);
  const firstWsMsg = useRef(false);

  // Auth check: redirect to login if no valid token
  useEffect(() => {
    (async () => {
      const token = await getToken();
      if (!token) {
        router.replace("/auth/login");
        return;
      }
      try {
        const res = await fetch(`${API_URL}/users/validate`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error();
      } catch {
        await deleteToken();
        router.replace("/auth/login");
      }
    })();
  }, []);


  // WebSocket for real-time nowPlaying/volume
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    function connectWs() {
      ws = new WebSocket(
        API_URL.startsWith("http")
          ? API_URL.replace(/^http/, "ws") + "/control/ws"
          : "ws://localhost:8000/control/ws"
      );
      wsRef.current = ws;
      ws.onopen = () => {
        // no-op
      };
      ws.onclose = () => {
        if (reconnectTimeout) clearTimeout(reconnectTimeout);
        reconnectTimeout = setTimeout(connectWs, 3000);
      };
      ws.onerror = () => {
        ws?.close();
      };
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          let relevant = false;
          if (data.type === "now_playing") {
            if (data.now_playing) {
              const filename = data.now_playing.split("/").pop();
              setNowPlaying(filename || null);
            } else {
              setNowPlaying(null);
            }
            relevant = true;
          }
          if (data.type === "volume" && typeof data.volume === "number") {
            setVolume(data.volume);
            volumeShared.value = data.volume;
            relevant = true;
          }
          if (relevant) {
            setLoading(false);
            firstWsMsg.current = true;
          }
        } catch { }
      };
    }
    connectWs();
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
    // eslint-disable-next-line
  }, []);

  const handleStop = async () => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/control/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setNowPlaying(null);
      checkShouldBePlaying();
      setLoading(true);
      firstWsMsg.current = false;
    } catch (err) {
      Alert.alert("Error", "No se pudo detener la música.");
    }
  };
  // On mount, check if a schedule should be playing
  useEffect(() => {
    checkShouldBePlaying();
  }, [checkShouldBePlaying]);

  const handleVolumeChange = async (value: number) => {
    try {
      const rounded = Math.round(value);
      const token = await getToken();
      await fetch(`${API_URL}/control/volume?level=${rounded}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      setVolume(rounded);
      volumeShared.value = rounded;
    } catch (err) {
      console.error("Error al cambiar volumen:", err);
    }
  };

  const handleLogout = async () => {
    try {
      await deleteToken();
      router.replace("/auth/login");
    } catch (err) {
      Alert.alert("Error", "No se pudo cerrar sesión.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.headerTitle}>Panel de Control</Text>
        <Text style={{ color: COLORS.textLight, fontSize: 14, marginBottom: 24 }}>
          Gestiona la música y el ambiente del jardín
        </Text>
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 64 }}
          showsVerticalScrollIndicator={false}
        >
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : nowPlaying ? (
            <View style={[styles.balanceCard, { marginBottom: 24 }]}>
              <Text style={styles.balanceTitle}>Reproduciendo</Text>
              <Text style={styles.balanceAmount}>{nowPlaying}</Text>

              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: COLORS.expense, marginTop: 10 }]}
                onPress={handleStop}
              >
                <Ionicons name="stop-circle" size={18} color={COLORS.white} />
                <Text style={styles.addButtonText}>Detener música</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[styles.emptyState, { marginBottom: 24 }]}>
              <Ionicons name="musical-notes-outline" size={32} color={COLORS.textLight} />
              <Text style={styles.emptyStateTitle}>Sin música</Text>
              <Text style={styles.emptyStateText}>
                Actualmente no hay ninguna canción en reproducción.
              </Text>
              {shouldBePlaying && (
                <TouchableOpacity
                  style={[styles.addButton, { backgroundColor: COLORS.primary, marginTop: 16 }]}
                  onPress={async () => {
                    // Resume schedule
                    try {
                      const token = await getToken();
                      await fetch(`${API_URL}/control/resume`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ token }),
                      });
                      setLoading(true); // Wait for WebSocket update
                      firstWsMsg.current = false;
                      setTimeout(async () => {
                        checkShouldBePlaying();
                        // Fallback: poll now_playing if WebSocket hasn't updated
                        try {
                          const res = await fetch(`${API_URL}/control/now_playing`, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ token }),
                          });
                          const data = await res.json();
                          if (data.now_playing) {
                            const filename = data.now_playing.split("/").pop();
                            setNowPlaying(filename || null);
                            setLoading(false);
                          }
                        } catch { }
                      }, 1200);
                    } catch (err) {
                      Alert.alert("Error", "No se pudo reanudar la rutina.");
                    }
                  }}
                >
                  <Ionicons name="play-circle" size={18} color={COLORS.white} />
                  <Text style={styles.addButtonText}>
                    Reanudar {scheduleName ? `“${scheduleName}”` : "rutina"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={[styles.balanceCard, { marginBottom: 32, padding: 16 }]}>
            <Text style={{ fontSize: 16, fontWeight: "500", color: COLORS.text, marginBottom: 12 }}>
              Volumen: {Math.round(volume)}%
            </Text>

            <Slider
              progress={volumeShared}
              minimumValue={min}
              maximumValue={max}
              containerStyle={{ height: 4, justifyContent: "center" }}
              theme={{
                maximumTrackTintColor: COLORS.border,
                minimumTrackTintColor: COLORS.primary,
              }}
              renderThumb={
                (thumbWidth = 50,
                  thumbTouchSize = 60,
                  disableTrackPress = true
                ) => (
                <View
                  style={{
                    backgroundColor: COLORS.primary,
                    borderColor: COLORS.primary,
                    borderWidth: 2,
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                  }}
                />
              )}
              renderBubble={() => null}
              onSlidingComplete={(val) => handleVolumeChange(val)}
              onValueChange={(val) => {
                setVolume(val);
                volumeShared.value = val
              }}
            />
          </View>

          <View style={{ gap: 16 }}>
            <TouchableOpacity
              style={[styles.addButton, { paddingVertical: 14, borderRadius: 28 }]}
              onPress={() => router.push("/tabs/routines")}
            >
              <Ionicons name="calendar-outline" size={20} color="#fff" />
              <Text style={[styles.addButtonText, { fontSize: 16 }]}>Rutinas</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.addButton, { paddingVertical: 14, borderRadius: 28 }]}
              onPress={() => router.push("/tabs/scenes")}
            >
              <Ionicons name="color-palette-outline" size={20} color="#fff" />
              <Text style={[styles.addButtonText, { fontSize: 16 }]}>Escenas</Text>
            </TouchableOpacity>
          </View>

        </ScrollView>

        <TouchableOpacity
          onPress={handleLogout}
          style={{
            position: "absolute",
            top: 20,
            right: 20,
            backgroundColor: "#f5f5f5",
            padding: 10,
            borderRadius: 20,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.1,
            shadowRadius: 2,
            elevation: 2,
          }}
        >
          <Ionicons name="log-out-outline" size={20} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={{
        paddingVertical: 12,
        borderTopWidth: 1,
        borderTopColor: COLORS.border,
        alignItems: "center",
        backgroundColor: COLORS.background,
      }}>
        <Text style={{ color: COLORS.textLight, fontSize: 12 }}>
          Made with ❤️ by Dani Callero
        </Text>
      </View>
    </SafeAreaView>
  );
}
