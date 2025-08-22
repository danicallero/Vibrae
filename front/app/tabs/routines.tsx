// app/tabs/routines.tsx
import React, { JSX, useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  Alert,
  SafeAreaView,
  View as RNView,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { Ionicons } from "@expo/vector-icons";
import { getToken } from "../../lib/storage";
import { useRouter } from "expo-router";
import { styles } from "../../assets/styles/home.styles";
import { sceneStyles } from "../../assets/styles/scenes.styles";
import { COLORS } from "../../constants/Colors";
import { API_URL } from "@env";
import { Slider } from "react-native-awesome-slider";
import { useSharedValue } from "react-native-reanimated";

type Routine = {
  id: number;
  name?: string;
  scene_id: number;
  start_time: string;
  end_time: string;
  volume: number;
  weekdays?: string;
  months?: string;
};
type Scene = { id: number; name: string };

const weekdayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthOptions = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const weekdayMap: { [key: string]: string } = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

const monthMap: { [key: string]: string } = {
  jan: "Jan",
  feb: "Feb",
  mar: "Mar",
  apr: "Apr",
  may: "May",
  jun: "Jun",
  jul: "Jul",
  aug: "Aug",
  sep: "Sep",
  oct: "Oct",
  nov: "Nov",
  dec: "Dec",
};

const sortDays = (days: string[]) => {
  const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
  return [...days].sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
};

export default function RoutinesScreen(): JSX.Element {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [showModal, setShowModal] = useState<boolean>(false);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [optionsRoutineId, setOptionsRoutineId] = useState<number | null>(null);

  const [name, setName] = useState<string>("");
  const [startTime, setStartTime] = useState<string>("");
  const [endTime, setEndTime] = useState<string>("");
  const [volume, setVolume] = useState<number>(50);
  const [selectedScene, setSelectedScene] = useState<number | null>(null);
  // keep weekdays/months in lowercase (as backend sends/expects)
  const [weekdays, setWeekdays] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [openPicker, setOpenPicker] = useState<boolean>(false);

  const volumeShared = useSharedValue<number>(50);
  const min = useSharedValue(0);
  const max = useSharedValue(100);

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const [routineRes, scenesRes] = await Promise.all([
        fetch(`${API_URL}/schedule/`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/scenes/`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (!routineRes.ok || !scenesRes.ok) throw new Error("API error");
      setRoutines(await routineRes.json());
      setScenes(await scenesRes.json());
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "No se pudieron cargar las rutinas o escenas.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const resetForm = () => {
    setName("");
    setStartTime("");
    setEndTime("");
    setVolume(50);
    volumeShared.value = 50;
    setSelectedScene(null);
    setWeekdays([]);
    setMonths([]);
    setIsEditing(false);
    setEditingId(null);
  };

  const submitRoutine = async () => {
    if (!selectedScene || !startTime || !endTime) {
      Alert.alert("Campos obligatorios", "Completa todos los campos obligatorios.");
      return;
    }
    try {
      const token = await getToken();
      const method = isEditing ? "PUT" : "POST";
      const url = isEditing ? `${API_URL}/schedule/${editingId}` : `${API_URL}/schedule/`;

      const body = {
        scene_id: selectedScene,
        start_time: startTime.trim(),
        end_time: endTime.trim(),
        // backend expects lowercase, we keep that format
        weekdays: weekdays.map((w) => w.toLowerCase()).join(","),
        months: months.map((m) => m.toLowerCase()).join(","),
        volume: Math.round(volume),
      };

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Error al guardar");

      resetForm();
      setShowModal(false);
      fetchData();
    } catch (err) {
      console.error(err);
      Alert.alert("Error", "No se pudo guardar la rutina.");
    }
  };

  const deleteRoutine = async (id: number) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/schedule/${id}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      fetchData();
    } catch (err) {
      Alert.alert("Error", "No se pudo eliminar la rutina.");
    }
  };

  const startEdit = (routine: Routine) => {
    setIsEditing(true);
    setEditingId(routine.id);
    setName(routine.name || "");
    setStartTime(routine.start_time || "");
    setEndTime(routine.end_time || "");
    setVolume(routine.volume || 50);
    volumeShared.value = routine.volume || 50;
    // keep lowercased arrays in state (they come from backend as lowercase)
    setWeekdays(routine.weekdays?.split(",").map((w) => w.trim().toLowerCase()) || []);
    setMonths(routine.months?.split(",").map((m) => m.trim().toLowerCase()) || []);
    setSelectedScene(routine.scene_id);
    setShowModal(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={{ paddingTop: 10, paddingHorizontal: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity onPress={fetchData} style={styles.backButton} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <Ionicons name="refresh" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.headerTitle}>Rutinas</Text>
        <Text style={{ color: COLORS.textLight, fontSize: 14, marginBottom: 24 }}>Programa tus escenas musicales por horario</Text>

        <TouchableOpacity style={[styles.addButton, { marginBottom: 24 }]} onPress={() => setShowModal(true)}>
          <Ionicons name="add" size={20} color={COLORS.textLight} />
          <Text style={styles.addButtonText}>Nueva rutina</Text>
        </TouchableOpacity>

        <FlatList
          data={routines}
          refreshing={loading}
          onRefresh={fetchData}
          keyExtractor={(item) => item.id.toString()}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => {
            const scene = scenes.find((s) => s.id === item.scene_id);
            const sceneName = scene?.name || null;
            const weekdaysRaw = item.weekdays?.split(",").map((w) => w.trim().toLowerCase()) || [];
            const monthsRaw = item.months?.split(",").map((m) => m.trim().toLowerCase()) || [];

            return (
              <View style={styles.balanceCard}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <View>
                    {sceneName != null ? (
                      <Text style={{ fontSize: 16, fontWeight: "700", color: COLORS.text }}>{sceneName}</Text>
                    ) : (
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Ionicons name="warning-outline" size={18} color={COLORS.expense} />
                        <Text style={{ fontSize: 15, color: COLORS.expense, fontWeight: "700", marginLeft: 6 }}> ¡Sin escena!</Text>
                      </View>
                    )}
                    <Text style={{ fontSize: 12, color: COLORS.textLight }}>{item.start_time} - {item.end_time}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setOptionsRoutineId(item.id)}>
                    <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textLight} />
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 8 }}>
                  {sortDays(weekdaysRaw).map((day, index) => (
                    <View key={index} style={sceneStyles.tag}>
                      <Text style={sceneStyles.tagText}>{weekdayMap[day]}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
                  {monthsRaw.map((month, index) => (
                    <View key={index} style={sceneStyles.tag}>
                      <Text style={sceneStyles.tagText}>{monthMap[month]}</Text>
                    </View>
                  ))}
                </View>

                <View style={{ flexDirection: "row", marginTop: 8 }}>
                  <View style={sceneStyles.tag}>
                    <Text style={sceneStyles.tagText}>Volumen: {item.volume}%</Text>
                  </View>
                </View>
              </View>
            );
          }}
        />

        {/* Options modal */}
        <Modal visible={!!optionsRoutineId} animationType="fade" transparent>
          <TouchableWithoutFeedback onPress={() => setOptionsRoutineId(null)}>
            <View style={sceneStyles.modalOverlay}>
              <View style={sceneStyles.modalContainer}>
                <Text style={[sceneStyles.modalTitle, { color: "#3b2a20" }]}>Opciones de rutina</Text>
                <Text style={sceneStyles.modalText}>Elige qué hacer con la rutina seleccionada.</Text>

                <View style={sceneStyles.modalActions}>
                  <TouchableOpacity
                    onPress={() => {
                      const routine = routines.find((r) => r.id === optionsRoutineId);
                      if (routine) startEdit(routine);
                      setOptionsRoutineId(null);
                    }}
                    style={sceneStyles.actionButtonPrimary}
                  >
                    <Text style={sceneStyles.actionButtonPrimaryText}>Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      if (optionsRoutineId != null) deleteRoutine(optionsRoutineId);
                      setOptionsRoutineId(null);
                    }}
                    style={[sceneStyles.actionButtonSecondary, { backgroundColor: COLORS.expense, borderColor: COLORS.expense }]}
                  >
                    <Text style={[sceneStyles.actionButtonSecondaryText, { color: COLORS.white }]}>Eliminar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setOptionsRoutineId(null)} style={sceneStyles.actionButtonSecondary}>
                    <Text style={sceneStyles.actionButtonSecondaryText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        {/* Create/edit modal */}
        <Modal visible={showModal} animationType="slide" transparent>
          <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} enabled={Platform.OS !== "web"} style={sceneStyles.modalOverlay}>
            <View style={sceneStyles.modalContainer}>
              <Text style={[sceneStyles.modalTitle, { color: "#3b2a20" }]}>{isEditing ? "Editar rutina" : "Nueva rutina"}</Text>
              <Text style={sceneStyles.modalText}>Define horario, volumen y escena a reproducir.</Text>

              <TextInput placeholder="Hora inicio (HH:MM)" style={sceneStyles.input} value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" />
              <TextInput placeholder="Hora fin (HH:MM)" style={sceneStyles.input} value={endTime} onChangeText={setEndTime} keyboardType="numbers-and-punctuation" />

              <View style={{ zIndex: 5000 }}>
                <DropDownPicker
                  open={openPicker}
                  value={selectedScene}
                  items={scenes.map((scene) => ({ label: scene.name, value: scene.id }))}
                  setOpen={setOpenPicker}
                  setValue={setSelectedScene}
                  placeholder="Escoge una escena"
                  style={sceneStyles.input}
                  dropDownContainerStyle={{
                    borderColor: COLORS.border,
                    backgroundColor: Platform.OS === "web" ? "rgba(255,255,255,0.98)" : COLORS.card,
                  }}
                />
              </View>

              <Text style={{ marginTop: 10, marginBottom: 10 }}>Volumen: {Math.round(volume)}%</Text>
              <Slider
                progress={volumeShared}
                minimumValue={min}
                maximumValue={max}
                onValueChange={(val) => {
                  setVolume(val);
                  volumeShared.value = val;
                }}
                containerStyle={{
                  height: 7,
                  justifyContent: "center",
                  borderRadius: 100,
                }}
                theme={{
                  maximumTrackTintColor: COLORS.border,
                  minimumTrackTintColor: COLORS.primary,
                }}
                renderBubble={() => null}
                renderThumb={() => <RNView style={{ backgroundColor: COLORS.primary, borderColor: COLORS.primary, borderWidth: 2, width: 16, height: 16, borderRadius: 10 }} />}
              />

              <Text style={{ marginTop: 10 }}>Días de la semana:</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                {weekdayOptions.map((day) => (
                  <TouchableOpacity
                    key={day}
                    style={{
                      padding: 6,
                      margin: 4,
                      borderRadius: 10,
                      backgroundColor: weekdays.includes(day.toLowerCase()) ? COLORS.primary : "rgba(0,0,0,0.03)",
                      width: 60,
                      alignItems: "center",
                    }}
                    onPress={() =>
                      setWeekdays((prev) =>
                        prev.includes(day.toLowerCase())
                          ? prev.filter((d) => d !== day.toLowerCase())
                          : [...prev, day.toLowerCase()]
                      )
                    }
                  >
                    <Text style={{ color: weekdays.includes(day.toLowerCase()) ? COLORS.white : COLORS.text }}>{day}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={{ marginTop: 10 }}>Meses:</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 8, marginTop: 8 }}>
                {monthOptions.map((month) => (
                  <TouchableOpacity
                    key={month}
                    style={{
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      backgroundColor: months.includes(month.toLowerCase()) ? COLORS.primary : "rgba(0,0,0,0.03)",
                      width: "22%",
                      minWidth: 64,
                      alignItems: "center",
                    }}
                    onPress={() =>
                      setMonths((prev) =>
                        prev.includes(month.toLowerCase()) ? prev.filter((m) => m !== month.toLowerCase()) : [...prev, month.toLowerCase()]
                      )
                    }
                  >
                    <Text style={{ color: months.includes(month.toLowerCase()) ? COLORS.white : COLORS.text }}>{month}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={sceneStyles.modalActions}>
                <TouchableOpacity onPress={() => { resetForm(); setShowModal(false); }} style={sceneStyles.actionButtonSecondary}>
                  <Text style={sceneStyles.actionButtonSecondaryText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={submitRoutine} style={sceneStyles.actionButtonPrimary}>
                  <Text style={sceneStyles.actionButtonPrimaryText}>{isEditing ? "Actualizar" : "Crear"}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </View>
    </SafeAreaView>
  );
}