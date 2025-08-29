// SPDX-License-Identifier: GPL-3.0-or-later
// app/tabs/routines.tsx

import { useEffect, useState, useCallback, useRef } from "react";
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
    ScrollView,
} from "react-native";
import { Dimensions } from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { getToken } from "../../lib/storage";
import { apiFetch } from "../../lib/api";
import { useRouter } from "expo-router";
import { styles } from "../../assets/styles/home.styles";
import { sceneStyles } from "../../assets/styles/scenes.styles";
import { COLORS } from "../../constants/Colors";
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
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<"list" | "week">("list");
    const [currentDate, setCurrentDate] = useState<Date>(new Date());

    // --- Helpers for time and summaries ---
    const timeRegex = /^([01]?\d|2[0-3]):[0-5]\d$/;
    const parseTimeToMins = (hhmm: string): number | null => {
        const m = hhmm.match(timeRegex);
        if (!m) return null;
        const [h, mm] = hhmm.split(":").map((v) => parseInt(v, 10));
        return h * 60 + mm;
    };
    const minsToHHMM = (mins: number) => {
        const m = ((mins % 1440) + 1440) % 1440; // normalize
        const h = Math.floor(m / 60);
        const mm = m % 60;
        return `${h.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
    };
    const addMinutes = (hhmm: string, delta: number) => {
        const m = parseTimeToMins(hhmm);
        if (m == null) return hhmm;
        return minsToHHMM(m + delta);
    };
    // order helpers kept in sortDays()

    const todayIndex = new Date().getDay(); // 0=Sun .. 6=Sat
    const todayKey = ["sun","mon","tue","wed","thu","fri","sat"][todayIndex];
    const yesterdayKey = ["sun","mon","tue","wed","thu","fri","sat"][((todayIndex + 6) % 7)];

    const isActiveNow = (r: Routine): boolean => {
        const s = parseTimeToMins(r.start_time);
        const e = parseTimeToMins(r.end_time);
        if (s == null || e == null) return false;
        const now = new Date();
        const nowMins = now.getHours() * 60 + now.getMinutes();
        const wdStr = (r.weekdays || "").toLowerCase();
        const hasToday = wdStr.includes(todayKey);
        const hasYesterday = wdStr.includes(yesterdayKey);
        if (e > s) {
            return hasToday && nowMins >= s && nowMins < e;
        }
        // overnight window (e <= s): today if after start, or yesterday if before end
        return (hasToday && nowMins >= s) || (hasYesterday && nowMins < e);
    };

    const summarizeDays = (wd: string | undefined) => {
        if (!wd || wd.trim() === "") return "Todos los días";
        const arr = Array.from(new Set(wd.split(",").map((w) => w.trim().toLowerCase())));
        const isWeekdays = arr.length === 5 && ["mon","tue","wed","thu","fri"].every(d => arr.includes(d));
        const isWeekends = arr.length === 2 && ["sat","sun"].every(d => arr.includes(d));
        if (arr.length === 7) return "Todos los días";
        if (isWeekdays) return "Laborables";
        if (isWeekends) return "Fin de semana";

        const order = ["mon","tue","wed","thu","fri","sat","sun"] as const;
        const labelsES: Record<string, string> = { mon: "Lun", tue: "Mar", wed: "Mié", thu: "Jue", fri: "Vie", sat: "Sáb", sun: "Dom" };
        const idxs = sortDays(arr).map((d) => order.indexOf(d as any)).filter((i) => i >= 0);
        const ranges: Array<[number, number]> = [];
        let start = idxs[0];
        let prev = idxs[0];
        for (let i = 1; i < idxs.length; i++) {
            const cur = idxs[i];
            if (cur !== prev + 1) {
                ranges.push([start, prev]);
                start = cur;
            }
            prev = cur;
        }
        ranges.push([start, prev]);
        // Merge wrap-around (Sun->Mon)
        if (ranges.length > 1 && ranges[0][0] === 0 && ranges[ranges.length - 1][1] === 6) {
            const first = ranges.shift()!; // [0, x]
            const last = ranges.pop()!;    // [y, 6]
            ranges.unshift([last[0], first[1]]);
        }
        return ranges.map(([a, b]) => (a === b ? labelsES[order[a]] : `de ${labelsES[order[a]]} a ${labelsES[order[b]]}`)).join(" · ");
    };
    const summarizeMonths = (m: string | undefined) => {
        if (!m || m.trim() === "") return "Todos los meses";
        const arr = Array.from(new Set(m.split(",").map((x) => x.trim().toLowerCase())));
        if (arr.length === 12) return "Todo el año";
        const order = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"] as const;
        const labelsES: Record<string, string> = { jan: "Ene", feb: "Feb", mar: "Mar", apr: "Abr", may: "May", jun: "Jun", jul: "Jul", aug: "Ago", sep: "Sep", oct: "Oct", nov: "Nov", dec: "Dic" };
        const idxs = arr.map((d) => order.indexOf(d as any)).filter((i) => i >= 0).sort((a, b) => a - b);
        const ranges: Array<[number, number]> = [];
        let start = idxs[0];
        let prev = idxs[0];
        for (let i = 1; i < idxs.length; i++) {
            const cur = idxs[i];
            if (cur !== prev + 1) {
                ranges.push([start, prev]);
                start = cur;
            }
            prev = cur;
        }
        ranges.push([start, prev]);
        // Merge wrap-around (Dec->Jan)
        if (ranges.length > 1 && ranges[0][0] === 0 && ranges[ranges.length - 1][1] === 11) {
            const first = ranges.shift()!; // [0, x]
            const last = ranges.pop()!;    // [y, 11]
            ranges.unshift([last[0], first[1]]);
        }
        return ranges.map(([a, b]) => (a === b ? labelsES[order[a]] : `de ${labelsES[order[a]]} a ${labelsES[order[b]]}`)).join(" · ");
    };

    const splitSummary = (s: string) => s.split(" · ").map((x) => x.trim()).filter(Boolean);

    // --- Calendar helpers ---
    const dayKeyOf = (d: Date): string => ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()];
    const monthKeyOf = (d: Date): string => ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"][d.getMonth()];
    const includesWeekday = (r: Routine, d: Date) => {
        if (!r.weekdays || r.weekdays.trim() === "") return true;
        return r.weekdays.toLowerCase().split(",").map(s => s.trim()).includes(dayKeyOf(d));
    };
    const includesMonth = (r: Routine, d: Date) => {
        if (!r.months || r.months.trim() === "") return true;
        return r.months.toLowerCase().split(",").map(s => s.trim()).includes(monthKeyOf(d));
    };
    const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
    const endOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
    const startOfWeekMon = (d: Date) => {
        const day = d.getDay(); // 0=Sun..6=Sat
        const diff = (day === 0 ? -6 : 1) - day; // move to Monday
        return addDays(d, diff);
    };
    // One representative week per month: use the week containing the 15th
    const representativeWeek = (() => {
        const middle = new Date(currentDate.getFullYear(), currentDate.getMonth(), 15);
        const start = startOfWeekMon(middle);
        return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    })();
    const monthLabelES = (d: Date) => {
        const months = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
        return months[d.getMonth()];
    };

    type DayEvent = { start: number; end: number; routine: Routine; sceneName: string };
    const sceneNameOf = (id: number) => scenes.find(s => s.id === id)?.name || "";
    const getDayEvents = (day: Date): DayEvent[] => {
        const prev = addDays(day, -1);
        const res: DayEvent[] = [];
        for (const r of routines) {
            const s = parseTimeToMins(r.start_time); const e = parseTimeToMins(r.end_time);
            if (s == null || e == null) continue;
            const name = sceneNameOf(r.scene_id);
            if (s < e) {
                if (includesWeekday(r, day) && includesMonth(r, day)) {
                    res.push({ start: s, end: e, routine: r, sceneName: name });
                }
            } else { // overnight
                if (includesWeekday(r, day) && includesMonth(r, day)) {
                    res.push({ start: s, end: 1440, routine: r, sceneName: name });
                }
                // show carry from previous day even if current day not listed, to visualize overnight span
                if (includesWeekday(r, prev) && includesMonth(r, prev) && e > 0) {
                    res.push({ start: 0, end: e, routine: r, sceneName: name });
                }
            }
        }
        // Optionally, sort by start
        return res.sort((a, b) => a.start - b.start);
    };

    const HOUR_HEIGHT = 40; // px per hour
    const hours = Array.from({ length: 25 }, (_, i) => i); // 0..24
    const windowHeight = Dimensions.get('window').height;
    const windowWidth = Dimensions.get('window').width;
    // viewport height for the timetable (ensures vertical scroll)
    const TIMETABLE_HEIGHT = Math.max(320, Math.min(HOUR_HEIGHT * 24, windowHeight - 260));
    const gridScrollRef = useRef<ScrollView | null>(null);
    // Horizontal sync between day header and grid
    const headerHScrollRef = useRef<ScrollView | null>(null);
    const gridHScrollRef = useRef<ScrollView | null>(null);
    const hSyncingRef = useRef<null | 'header' | 'grid'>(null);
    const onHeaderHScroll = (e: any) => {
        if (hSyncingRef.current === 'grid') return;
        const x = e?.nativeEvent?.contentOffset?.x ?? 0;
        hSyncingRef.current = 'header';
        if (gridHScrollRef.current) gridHScrollRef.current.scrollTo({ x, animated: false });
        requestAnimationFrame(() => { hSyncingRef.current = null; });
    };
    const onGridHScroll = (e: any) => {
        if (hSyncingRef.current === 'header') return;
        const x = e?.nativeEvent?.contentOffset?.x ?? 0;
        hSyncingRef.current = 'grid';
        if (headerHScrollRef.current) headerHScrollRef.current.scrollTo({ x, animated: false });
        requestAnimationFrame(() => { hSyncingRef.current = null; });
    };
    // Horizontal readability controls
    const [weekWide, setWeekWide] = useState(true);
    const GAP = 6; // px gap between day columns
    const FIT_DAY_WIDTH = Math.max(86, Math.floor((windowWidth - 42 - GAP * 6 - 12) / 7));
    const DAY_WIDTH = weekWide ? 156 : FIT_DAY_WIDTH;
    const [now, setNow] = useState<Date>(new Date());
    const isCurrentMonth = currentDate.getFullYear() === now.getFullYear() && currentDate.getMonth() === now.getMonth();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const scrollToNow = () => {
        if (!gridScrollRef.current) return;
        const y = Math.max(0, Math.min(HOUR_HEIGHT * 24 - TIMETABLE_HEIGHT, (currentMinutes / 60) * HOUR_HEIGHT - TIMETABLE_HEIGHT / 2));
        gridScrollRef.current.scrollTo({ y, animated: true });
    };

    useEffect(() => {
        if (viewMode === 'week' && isCurrentMonth) {
            // slight delay to allow layout
            const t = setTimeout(scrollToNow, 50);
            return () => clearTimeout(t);
        }
    }, [viewMode, currentDate, isCurrentMonth]);

    // Live update current time line each minute when viewing current month
    useEffect(() => {
        if (!(viewMode === 'week' && isCurrentMonth)) return;
        const tick = () => setNow(new Date());
        // align roughly to next minute
        const msToNextMinute = 60000 - (Date.now() % 60000);
        const lead = setTimeout(() => {
            tick();
            const id = setInterval(tick, 60000);
            (tick as any)._interval = id; // store for cleanup
        }, msToNextMinute);
        return () => {
            clearTimeout(lead);
            const id = (tick as any)._interval; if (id) clearInterval(id);
        };
    }, [viewMode, isCurrentMonth]);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const [routineRes, scenesRes] = await Promise.all([
                apiFetch(`/schedule/`),
                apiFetch(`/scenes/`)
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
        if (!timeRegex.test(startTime) || !timeRegex.test(endTime)) {
            setErrorMsg("Formato de hora inválido. Usa HH:MM (24h)");
            return;
        }
        setErrorMsg(null);
        // Optional sanity: forbid identical times
        const s = parseTimeToMins(startTime)!;
        const e = parseTimeToMins(endTime)!;
        if (s === e) {
            setErrorMsg("La hora de fin no puede ser igual a la de inicio.");
            return;
        }
        try {
            const method = isEditing ? "PUT" : "POST";
            const url = isEditing
                ? `/schedule/${editingId}`
                : `/schedule/`;

            const body = {
                scene_id: selectedScene,
                start_time: startTime.trim(),
                end_time: endTime.trim(),
                weekdays: weekdays.map(w => w.toLowerCase()).join(","),
                months: months.map(m => m.toLowerCase()).join(","),
                volume: Math.round(volume),
            };

            const res = await apiFetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
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

    const duplicateRoutine = async (id: number) => {
        const r = routines.find((x) => x.id === id);
        if (!r) return;
        try {
            const body = {
                scene_id: r.scene_id,
                start_time: r.start_time,
                end_time: r.end_time,
                weekdays: r.weekdays || "",
                months: r.months || "",
                volume: r.volume,
            };
            const res = await apiFetch(`/schedule/`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error("dup failed");
            fetchData();
        } catch (e) {
            Alert.alert("Error", "No se pudo duplicar la rutina.");
        }
    };

    const deleteRoutine = async (id: number) => {
        try {
            await apiFetch(`/schedule/${id}/`, {
                method: "DELETE",
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
                <Text style={{ color: COLORS.textLight, fontSize: 14, marginBottom: 8 }}>
                    Programa tus escenas musicales por horario
                </Text>
                {errorMsg && (
                    <View style={{ backgroundColor: '#ffefef', borderColor: '#f3b5b5', borderWidth: 1, padding: 8, borderRadius: 8, marginBottom: 8 }}>
                        <Text style={{ color: '#b00020' }}>{errorMsg}</Text>
                    </View>
                )}

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <TouchableOpacity style={[styles.addButton]} onPress={() => setShowModal(true)}>
                        <Ionicons name="add" size={20} color="#fff" />
                        <Text style={styles.addButtonText}>Nueva rutina</Text>
                    </TouchableOpacity>
                                        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                        <TouchableOpacity onPress={() => setViewMode('list')} style={[sceneStyles.tag, { backgroundColor: viewMode==='list'? COLORS.primary : COLORS.border }]}>
                            <Text style={[sceneStyles.tagText, { color: viewMode==='list' ? '#fff' : COLORS.text }]}>Lista</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setViewMode('week')} style={[sceneStyles.tag, { backgroundColor: viewMode==='week'? COLORS.primary : COLORS.border }]}>
                            <Text style={[sceneStyles.tagText, { color: viewMode==='week' ? '#fff' : COLORS.text }]}>Semana</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {viewMode === 'list' ? (
                <FlatList
                    data={routines}
                    refreshing={loading}
                    onRefresh={fetchData}
                    keyExtractor={(item) => item.id.toString()}
                    keyboardShouldPersistTaps="handled"
                    renderItem={({ item }) => {
                        const scene = scenes.find(s => s.id === item.scene_id);
                        const sceneName = scene?.name || null;
                        const weekdaysRaw = item.weekdays?.split(",").map(w => w.trim().toLowerCase()) || [];
                        const monthsRaw = item.months?.split(",").map(m => m.trim().toLowerCase()) || [];
                        const active = isActiveNow(item);

                        return (
                            <View style={styles.balanceCard}>
                                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: 'center' }}>
                                    <View>
                                        {sceneName != null ? (
                                            <Text style={{ fontSize: 15, fontWeight: "600", color: COLORS.text }}>{sceneName}</Text>
                                        ) : (
                                            <View style={{ flex: 1, flexDirection: "row"}}>
                                                <Ionicons name="warning-outline" size={20} color="#e78f3cff" /> <Text style={{ fontSize: 15, color: COLORS.warning, fontWeight: "600" }}> ¡Sin escena!</Text>
                                            </View>
                                        )}
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                            <Text style={{ fontSize: 12, color: COLORS.textLight }}>
                                                {item.start_time} - {item.end_time}
                                            </Text>
                                            {active && (
                                                <View style={[sceneStyles.tag, { backgroundColor: '#e6f7ef', borderColor: '#b6e6cc' }]}>
                                                    <Text style={[sceneStyles.tagText, { color: '#0a7d4f' }]}>Activa ahora</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={() => setOptionsRoutineId(item.id)}>
                                        <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textLight} />
                                    </TouchableOpacity>
                                </View>

                                {/* Días (en cajas) */}
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                                    {splitSummary(summarizeDays(item.weekdays)).map((seg, idx) => (
                                        <View key={`d-${idx}`} style={sceneStyles.tag}>
                                            <Text style={sceneStyles.tagText}>{seg}</Text>
                                        </View>
                                    ))}
                                </View>

                                {/* Meses (en cajas) */}
                                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                                    {splitSummary(summarizeMonths(item.months)).map((seg, idx) => (
                                        <View key={`m-${idx}`} style={sceneStyles.tag}>
                                            <Text style={sceneStyles.tagText}>{seg}</Text>
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
                ) : (
                    <View style={{ marginTop: 8 }}>
                        {/* Week header and navigation */}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <TouchableOpacity onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1))}>
                                <Ionicons name="chevron-back" size={22} color={COLORS.text} />
                            </TouchableOpacity>
                            <Text style={{ fontWeight: '600', color: COLORS.text }}>{monthLabelES(currentDate)}</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TouchableOpacity
                                    onPress={() => {
                                        if (!isCurrentMonth) {
                                            setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
                                        } else {
                                            scrollToNow();
                                        }
                                    }}
                                    style={[sceneStyles.tag, { paddingVertical: 6 }]}
                                >
                                    <Text style={sceneStyles.tagText}>Ahora</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setWeekWide((w) => !w)} style={[sceneStyles.tag, { paddingVertical: 6 }]}> 
                                    <Text style={sceneStyles.tagText}>{weekWide ? 'Encoger' : 'Ampliar'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth()+1, 1))}>
                                    <Ionicons name="chevron-forward" size={22} color={COLORS.text} />
                                </TouchableOpacity>
                            </View>
                        </View>
                        {/* Day headers */}
                        <View style={{ flexDirection: 'row', gap: GAP, paddingHorizontal: 2, alignItems: 'center' }}>
                            {/* Hour margin spacer */}
                            <View style={{ width: 42 }} />
                            {weekWide ? (
                                <ScrollView
                                    ref={headerHScrollRef}
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    scrollEventThrottle={16}
                                    onScroll={onHeaderHScroll}
                                >
                                    <View style={{ flexDirection: 'row', gap: GAP }}>
                                        {representativeWeek.map((d, idx) => (
                                            <View key={idx} style={{ width: DAY_WIDTH, alignItems: 'center' }}>
                                                <Text style={{ fontSize: 12, color: COLORS.text }}>
                                                    {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"][ (d.getDay()+6)%7 ]}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>
                                </ScrollView>
                            ) : (
                                <View style={{ flex: 1, flexDirection: 'row', gap: GAP }}>
                                    {representativeWeek.map((d, idx) => (
                                        <View key={idx} style={{ flex: 1, alignItems: 'center' }}>
                                            <Text style={{ fontSize: 12, color: COLORS.text }}>
                                                {["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"][ (d.getDay()+6)%7 ]}
                                            </Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                        {/* Week grid */}
                        <ScrollView ref={gridScrollRef} style={{ marginTop: 6, height: TIMETABLE_HEIGHT }} contentContainerStyle={{ paddingBottom: 16 }}>
                            <View style={{ height: HOUR_HEIGHT * 24, flexDirection: 'row', gap: GAP }}>
                                {/* Hour margin with labels */}
                                <View style={{ width: 42, position: 'relative' }}>
                                    {hours.slice(0,24).map((h) => (
                                        <Text key={h} style={{ position: 'absolute', top: h * HOUR_HEIGHT - 6, right: 2, fontSize: 10, color: COLORS.textLight }}>
                                            {String(h).padStart(2,'0')}:00
                                        </Text>
                                    ))}
                                </View>
                                {weekWide ? (
                                    <ScrollView
                                        ref={gridHScrollRef}
                                        horizontal
                                        showsHorizontalScrollIndicator={true}
                                        scrollEventThrottle={16}
                                        onScroll={onGridHScroll}
                                    >
                                        <View style={{ flexDirection: 'row', gap: GAP }}>
                                            {representativeWeek.map((d, idx) => (
                                                <View key={idx} style={{ width: DAY_WIDTH, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden' }}>
                                                    {/* Hour lines */}
                                                    <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                                                        {hours.map((h) => (
                                                            <View key={h} style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR_HEIGHT, height: 1, backgroundColor: h % 6 === 0 ? COLORS.border : '#eef4ff' }} />
                                                        ))}
                                                        {/* Current time line, only for current month */}
                                                        {isCurrentMonth && (
                                                            <View style={{ position: 'absolute', left: 0, right: 0, top: (currentMinutes / 60) * HOUR_HEIGHT, height: 2, backgroundColor: '#ff4d4f' }} />
                                                        )}
                                                    </View>
                                                    {/* Events */}
                                                    <View style={{ flex: 1 }}>
                                                        {getDayEvents(d).map((ev, i) => {
                                                            const isTodayCol = isCurrentMonth && d.toDateString() === now.toDateString();
                                                            const isActive = isTodayCol && currentMinutes >= ev.start && currentMinutes < ev.end;
                                                            return (
                                                            <TouchableOpacity
                                                                key={i}
                                                                style={{
                                                                    position: 'absolute',
                                                                    left: 4,
                                                                    right: 4,
                                                                    top: ev.start / 60 * HOUR_HEIGHT,
                                                                    height: Math.max(6, (ev.end - ev.start) / 60 * HOUR_HEIGHT - 2),
                                                                    backgroundColor: isActive ? '#e6f7ef' : '#e8f0ff',
                                                                    borderColor: isActive ? '#17a673' : COLORS.primary,
                                                                    borderWidth: 1,
                                                                    borderRadius: 6,
                                                                    padding: 4,
                                                                }}
                                                                onPress={() => startEdit(ev.routine)}
                                                            >
                                                                <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: COLORS.text }}>
                                                                    {ev.sceneName || `Escena ${ev.routine.scene_id}`}
                                                                </Text>
                                                                <Text numberOfLines={1} style={{ fontSize: 10, color: isActive ? '#0a7d4f' : COLORS.textLight }}>
                                                                    {ev.routine.start_time} – {ev.routine.end_time} · {ev.routine.volume}%
                                                                </Text>
                                                            </TouchableOpacity>
                                                            );
                                                        })}
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    </ScrollView>
                                ) : (
                                    <View style={{ flexDirection: 'row', gap: GAP, flex: 1 }}>
                                        {representativeWeek.map((d, idx) => (
                                            <View key={idx} style={{ flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, overflow: 'hidden' }}>
                                                {/* Hour lines */}
                                                <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}>
                                                    {hours.map((h) => (
                                                        <View key={h} style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR_HEIGHT, height: 1, backgroundColor: h % 6 === 0 ? COLORS.border : '#eef4ff' }} />
                                                    ))}
                                                    {/* Current time line, only for current month */}
                                                    {isCurrentMonth && (
                                                        <View style={{ position: 'absolute', left: 0, right: 0, top: (currentMinutes / 60) * HOUR_HEIGHT, height: 2, backgroundColor: '#ff4d4f' }} />
                                                    )}
                                                </View>

                                                <View style={{ flex: 1 }}>
                                                    {getDayEvents(d).map((ev, i) => {
                                                        const isTodayCol = isCurrentMonth && d.toDateString() === now.toDateString();
                                                        const isActive = isTodayCol && currentMinutes >= ev.start && currentMinutes < ev.end;
                                                        return (
                                                        <TouchableOpacity
                                                            key={i}
                                                            style={{
                                                                position: 'absolute',
                                                                left: 4,
                                                                right: 4,
                                                                top: ev.start / 60 * HOUR_HEIGHT,
                                                                height: Math.max(6, (ev.end - ev.start) / 60 * HOUR_HEIGHT - 2),
                                                                backgroundColor: isActive ? '#e6f7ef' : '#e8f0ff',
                                                                borderColor: isActive ? '#17a673' : COLORS.primary,
                                                                borderWidth: 1,
                                                                borderRadius: 6,
                                                                padding: 4,
                                                            }}
                                                            onPress={() => startEdit(ev.routine)}
                                                        >
                                                            <Text numberOfLines={1} style={{ fontSize: 11, fontWeight: '600', color: COLORS.text }}>
                                                                {ev.sceneName || `Escena ${ev.routine.scene_id}`}
                                                            </Text>
                                                            <Text numberOfLines={1} style={{ fontSize: 10, color: isActive ? '#0a7d4f' : COLORS.textLight }}>
                                                                {ev.routine.start_time} – {ev.routine.end_time} · {ev.routine.volume}%
                                                            </Text>
                                                        </TouchableOpacity>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        ))}
                                    </View>
                                )}
                            </View>
                        </ScrollView>
                    </View>
                )}

                {/* Options modal */}
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
                                        if (optionsRoutineId != null) duplicateRoutine(optionsRoutineId);
                                        setOptionsRoutineId(null);
                                    }}
                                    style={[styles.addButton, { marginBottom: 5, backgroundColor: COLORS.income }]}
                                >
                                    <Text style={styles.addButtonText}>Duplicar</Text>
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

                {/* Create/edit modal */}
                <Modal visible={showModal} animationType="slide" transparent>
                    <KeyboardAvoidingView
                        behavior={Platform.OS === "ios" ? "padding" : undefined}
                        enabled={Platform.OS !== "web"}
                        style={sceneStyles.modalOverlay}
                    >
                        <View style={sceneStyles.modalContainer}>
                            <Text style={styles.headerTitle}>{isEditing ? "Editar rutina" : "Nueva rutina"}</Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <TextInput
                                    placeholder="Inicio (HH:MM)"
                                    style={[sceneStyles.input, { flex: 1 }]}
                                    value={startTime}
                                    onChangeText={setStartTime}
                                    keyboardType="numbers-and-punctuation"
                                />
                                <View style={{ alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 }}>
                                    <Text style={{ color: COLORS.textLight, fontSize: 16, lineHeight: 16, marginTop: -15 }}>-</Text>
                                </View>
                                <TextInput
                                    placeholder="Fin (HH:MM)"
                                    style={[sceneStyles.input, { flex: 1 }]}
                                    value={endTime}
                                    onChangeText={setEndTime}
                                    keyboardType="numbers-and-punctuation"
                                />
                            </View>

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
                                    height: 7,
                                    justifyContent: 'center',
                                    borderRadius: 100
                                }}
                                theme={{
                                    maximumTrackTintColor: COLORS.border,
                                    minimumTrackTintColor: COLORS.primary,

                                }}
                                renderBubble={() => null}

                                renderThumb={(
                                    thumbWidth = 50,
                                    thumbTouchSize = 100,
                                    disableTrackPress = true
                                ) => <View
                                        style={{
                                            backgroundColor: COLORS.primary,
                                            borderColor: COLORS.primary,
                                            borderWidth: 2,
                                            width: 16,
                                            height: 16,
                                            borderRadius: 10,
                                        }}
                                    />
                                }
                            />


                            <Text style={{ marginTop: 10 }}>Días de la semana:</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                                <TouchableOpacity
                                    style={[sceneStyles.tag, { paddingVertical: 6 }]} onPress={() => setWeekdays([...weekdayOptions])}
                                >
                                    <Text style={sceneStyles.tagText}>Todos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[sceneStyles.tag, { paddingVertical: 6 }]} onPress={() => setWeekdays(["Mon","Tue","Wed","Thu","Fri"]) }
                                >
                                    <Text style={sceneStyles.tagText}>Laborables</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[sceneStyles.tag, { paddingVertical: 6 }]} onPress={() => setWeekdays(["Sat","Sun"]) }
                                >
                                    <Text style={sceneStyles.tagText}>Fin de semana</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[sceneStyles.tag, { paddingVertical: 6 }]} onPress={() => setWeekdays([])}
                                >
                                    <Text style={sceneStyles.tagText}>Ninguno</Text>
                                </TouchableOpacity>
                            </View>
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
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 6 }}>
                                <TouchableOpacity style={[sceneStyles.tag, { paddingVertical: 6 }]} onPress={() => setMonths([...monthOptions])}>
                                    <Text style={sceneStyles.tagText}>Todos</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[sceneStyles.tag, { paddingVertical: 6 }]} onPress={() => setMonths([])}>
                                    <Text style={sceneStyles.tagText}>Ninguno</Text>
                                </TouchableOpacity>
                            </View>
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
