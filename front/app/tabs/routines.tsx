import { useEffect, useState, useCallback } from "react";
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
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { SafeAreaView } from "react-native-safe-area-context";
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

type Scene = {
    id: number;
    name: string;
};

const RoutinesScreen = () => {
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
    const [weekdays, setWeekdays] = useState<string[]>([]);
    const [months, setMonths] = useState<string[]>([]);
    const [openPicker, setOpenPicker] = useState<boolean>(false);

    const volumeShared = useSharedValue<number>(50);

    const weekdayOptions = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const monthOptions = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

    const weekdayMap: { [key: string]: string } = {
        mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun"
    };

    const monthMap: { [key: string]: string } = {
        jan: "Jan", feb: "Feb", mar: "Mar", apr: "Apr", may: "May", jun: "Jun",
        jul: "Jul", aug: "Aug", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dec"
    };

    const sortDays = (days: string[]): string[] => {
        const order = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
        return [...days].sort((a, b) => order.indexOf(a.toLowerCase()) - order.indexOf(b.toLowerCase()));
    };

    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = await getToken();
            const [routineRes, scenesRes] = await Promise.all([
                fetch(`${API_URL}/schedule/`, { headers: { Authorization: `Bearer ${token}` } }),
                fetch(`${API_URL}/scenes/`, { headers: { Authorization: `Bearer ${token}` } })
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
            const url = isEditing
                ? `${API_URL}/schedule/${editingId}`
                : `${API_URL}/schedule/`;

            const body = {
                scene_id: selectedScene,
                start_time: startTime.trim(),
                end_time: endTime.trim(),
                weekdays: weekdays.map(w => w.toLowerCase()).join(","),
                months: months.map(m => m.toLowerCase()).join(","),
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
        setWeekdays(routine.weekdays?.split(",").map(w => weekdayMap[w.trim().toLowerCase()]) || []);
        setMonths(routine.months?.split(",").map(m => monthMap[m.trim().toLowerCase()]) || []);
        setSelectedScene(routine.scene_id);
        setShowModal(true);
    };

    const DismissKeyboardWrapper = ({ children }: { children: React.ReactNode }) => {
        if (Platform.OS === 'web') return <>{children}</>;
        return (
            <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
                {children}
            </TouchableWithoutFeedback>
        );
    };

    return (
        <SafeAreaView style={styles.container}>
            <View style={{ paddingTop: 10, paddingHorizontal: 10, flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
                    <Ionicons name="chevron-back" size={28} color={COLORS.text} />
                </TouchableOpacity>

                <TouchableOpacity onPress={fetchData} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
                    <Ionicons name="refresh" size={24} color={COLORS.text} />
                </TouchableOpacity>
            </View>

            <View style={styles.content}>
                <Text style={styles.headerTitle}>Rutinas</Text>
                <Text style={{ color: COLORS.textLight, fontSize: 14, marginBottom: 24 }}>
                    Programa tus escenas musicales por horario
                </Text>

                <TouchableOpacity style={[styles.addButton, { marginBottom: 24 }]} onPress={() => setShowModal(true)}>
                    <Ionicons name="add" size={20} color="#fff" />
                    <Text style={styles.addButtonText}>Nueva rutina</Text>
                </TouchableOpacity>

                <FlatList
                    data={routines}
                    refreshing={loading}
                    onRefresh={fetchData}
                    keyExtractor={(item) => item.id.toString()}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                        const scene = scenes.find(s => s.id === item.scene_id);
                        const sceneName = scene?.name || "Sin nombre";
                        const weekdaysRaw = item.weekdays?.split(",").map(w => w.trim().toLowerCase()) || [];
                        const monthsRaw = item.months?.split(",").map(m => m.trim().toLowerCase()) || [];

                        return (
                            <View style={styles.balanceCard}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                                    <View>
                                        <Text style={{ fontSize: 15, fontWeight: "600", color: COLORS.text }}>{sceneName}</Text>
                                        <Text style={{ fontSize: 12, color: COLORS.textLight }}>
                                            {item.start_time} - {item.end_time}
                                        </Text>
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

                                <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
                                    {monthsRaw.map((month, index) => (
                                        <View key={index} style={sceneStyles.tag}>
                                            <Text style={sceneStyles.tagText}>{monthMap[month]}</Text>
                                        </View>
                                    ))}
                                </View>

                                <View style={{ flexDirection: "row", marginTop: 4 }}>
                                    <View style={sceneStyles.tag}>
                                        <Text style={sceneStyles.tagText}>Volumen: {item.volume}%</Text>
                                    </View>
                                </View>
                            </View>
                        );
                    }}
                />

                {/* MODAL DE OPCIONES */}
                <Modal visible={!!optionsRoutineId} animationType="fade" transparent>
                    <TouchableWithoutFeedback onPress={() => setOptionsRoutineId(null)}>
                        <View style={sceneStyles.modalOverlay}>
                            <View style={sceneStyles.modalContainer}>
                                <Text style={styles.headerTitle}>Opciones de rutina</Text>

                                <TouchableOpacity
                                    onPress={() => {
                                        const routine = routines.find((r) => r.id === optionsRoutineId);
                                        if (routine) startEdit(routine);
                                        setOptionsRoutineId(null);
                                    }}
                                    style={[styles.addButton, { marginBottom: 5 }]}
                                >
                                    <Text style={styles.addButtonText}>Editar rutina</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => {
                                        if (optionsRoutineId != null) deleteRoutine(optionsRoutineId);
                                        setOptionsRoutineId(null);
                                    }}
                                    style={[styles.addButton, { backgroundColor: COLORS.expense }]}
                                >
                                    <Text style={styles.addButtonText}>Eliminar rutina</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setOptionsRoutineId(null)}
                                    style={[styles.addButton, { backgroundColor: COLORS.border, marginTop: 12 }]}
                                >
                                    <Text style={styles.addButtonText}>Cancelar</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </TouchableWithoutFeedback>
                </Modal>

                {/* Modal for create/edit */}
                <Modal visible={showModal} animationType="slide" transparent>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : undefined}
                        enabled={Platform.OS !== "web"}
                        style={sceneStyles.modalOverlay}
                    >
                        <View style={sceneStyles.modalContainer}>
                            <Text style={styles.headerTitle}>{isEditing ? "Editar rutina" : "Nueva rutina"}</Text>

                            <TextInput
                                placeholder="Hora inicio (HH:MM)"
                                style={sceneStyles.input}
                                value={startTime}
                                onChangeText={setStartTime}
                                keyboardType="numbers-and-punctuation"
                            />
                            <TextInput
                                placeholder="Hora fin (HH:MM)"
                                style={sceneStyles.input}
                                value={endTime}
                                onChangeText={setEndTime}
                                keyboardType="numbers-and-punctuation"
                            />

                            <View style={{ zIndex: 5000 }}>
                                <DropDownPicker
                                    open={openPicker}
                                    value={selectedScene}
                                    items={scenes.map(scene => ({ label: scene.name, value: scene.id }))}
                                    setOpen={setOpenPicker}
                                    setValue={setSelectedScene}
                                    placeholder="Escoge una escena"
                                    style={{ borderColor: COLORS.border, marginBottom: 16 }}
                                />
                            </View>

                            <Text style={{ marginTop: 10, marginBottom: 10 }}>Volumen: {Math.round(volume)}%</Text>
                            <Slider
                                progress={volumeShared}
                                minimumValue={useSharedValue(0)}
                                maximumValue={useSharedValue(100)}
                                onValueChange={(val) => {
                                    setVolume(val);
                                    volumeShared.value = val;
                                }}
                                containerStyle={{
                                    height: 4,
                                    justifyContent: 'center',
                                }}
                                theme={{
                                    maximumTrackTintColor: COLORS.border || '#E8D7BA',
                                    minimumTrackTintColor: COLORS.primary || '#8B5C3E',

                                }}
                                renderBubble={() => null}

                            />


                            <Text style={{ marginTop: 10 }}>Días de la semana:</Text>
                            <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                                {weekdayOptions.map(day => (
                                    <TouchableOpacity
                                        key={day}
                                        style={{
                                            padding: 6,
                                            margin: 4,
                                            borderRadius: 10,
                                            backgroundColor: weekdays.includes(day) ? COLORS.primary : COLORS.border,
                                            width: 60,
                                            alignItems: "center"
                                        }}
                                        onPress={() =>
                                            setWeekdays(prev =>
                                                prev.includes(day)
                                                    ? prev.filter(d => d !== day)
                                                    : [...prev, day]
                                            )
                                        }
                                    >
                                        <Text style={{ color: COLORS.text }}>{day}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>


                            <Text style={{ marginTop: 10 }}>Meses:</Text>
                            <View style={{
                                flexDirection: "row",
                                flexWrap: "wrap",
                                justifyContent: "flex-start",
                                gap: 8,
                                marginTop: 8
                            }}>
                                {monthOptions.map(month => (
                                    <TouchableOpacity
                                        key={month}
                                        style={{
                                            paddingVertical: 6,
                                            paddingHorizontal: 10,
                                            borderRadius: 10,
                                            backgroundColor: months.includes(month) ? COLORS.primary : COLORS.border,
                                            width: "22%",
                                            minWidth: 64,
                                            alignItems: "center",
                                        }}
                                        onPress={() =>
                                            setMonths(prev =>
                                                prev.includes(month)
                                                    ? prev.filter(m => m !== month)
                                                    : [...prev, month]
                                            )
                                        }
                                    >
                                        <Text style={{ color: COLORS.text }}>{month}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>


                            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12, marginTop: 20 }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        resetForm();
                                        setShowModal(false);
                                    }}
                                    style={[styles.addButton, { backgroundColor: COLORS.border }]}
                                >
                                    <Text style={styles.addButtonText}>Cancelar</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={submitRoutine} style={styles.addButton}>
                                    <Text style={styles.addButtonText}>{isEditing ? "Actualizar" : "Crear"}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>
            </View>
        </SafeAreaView>
    );
};

export default RoutinesScreen;
