// styles/logs.styles.js
import { StyleSheet, Platform } from 'react-native';
import { COLORS } from '../../constants/Colors';

export const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: COLORS.background },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    row: { flex: 1, flexDirection: 'row' },

    // Sidebar
    leftPane: { width: 280, borderRightWidth: 1, borderRightColor: '#eee', padding: 12, backgroundColor: COLORS.card },
    leftPaneContent: { flex: 1 },

    // Right pane
    rightPane: { flex: 1, padding: 12 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start' },

    section: { fontWeight: '600', fontSize: 16, marginBottom: 6, color: COLORS.primaryEnd },
    list: { maxHeight: '48%' },
    item: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' },
    itemSelected: { backgroundColor: '#f6f8ff' },
    fileName: { fontSize: 14, color: COLORS.primaryEnd },
    meta: { color: COLORS.primaryMid, fontSize: 12 },

    controls: { marginBottom: 8 },
    tailRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    tailInput: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 80, color: COLORS.primaryEnd },
    btn: { backgroundColor: COLORS.primaryEnd, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6 },
    btnText: { color: COLORS.white, fontWeight: '600' },

    // Log content area: strictly black background and white text
    content: { flex: 1, marginTop: 8, backgroundColor: '#000', borderRadius: 8, padding: 10 },
    mono: { color: '#fff', fontFamily: Platform.OS === 'ios' ? 'Menlo' : Platform.OS === 'android' ? 'monospace' : 'monospace' },

    error: { color: '#b91c1c', paddingHorizontal: 12, paddingVertical: 6 },

    // Mobile overlay sidebar
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row' },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    sidebarSheet: { width: 300, backgroundColor: COLORS.card, padding: 12, borderRightWidth: 1, borderRightColor: '#e5e7eb', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
    sidebarHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },

    rightHistoryList: { maxHeight: 240 },

    // History chips row (top of controls)
    historyChipsRow: { flex: 1, marginLeft: 8 },
    chipsContent: { paddingHorizontal: 4, alignItems: 'center' },
    chip: { borderWidth: 1, borderColor: COLORS.primaryEnd, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, marginLeft: 6, backgroundColor: COLORS.card },
    chipActive: { backgroundColor: COLORS.primaryEnd },
    chipText: { color: COLORS.primaryEnd, fontSize: 12 },
    chipTextActive: { color: COLORS.white },

    // Colored log formatting
    time: { color: '#9CA3AF' }, // gray-400
    level: { fontWeight: '700' },
    levelInfo: { color: '#22c55e' }, // green-500
    levelWarn: { color: '#f59e0b' }, // amber-500
    levelError: { color: '#ef4444' }, // red-500
    levelDebug: { color: '#9CA3AF' }, // gray-400
    levelCritical: { color: '#dc2626' }, // red-600
    logger: { color: '#60a5fa' }, // blue-400
    message: { color: '#ffffff' },
    stackLine: { color: '#D1D5DB' }, // gray-300
    headerLine: { color: '#34d399', fontWeight: '700' }, // emerald-400

    // Nginx / access log helpers
    ip: { color: '#A78BFA' }, // violet-400
    bracketDate: { color: '#9CA3AF' },
    method: { fontWeight: '700' },
    methodGet: { color: '#22d3ee' }, // cyan-400
    methodPost: { color: '#a78bfa' }, // violet-400
    methodPut: { color: '#f59e0b' }, // amber-500
    methodDelete: { color: '#ef4444' }, // red-500
    methodOther: { color: '#10b981' }, // emerald-500
    path: { color: '#ffffff' },
    status2xx: { color: '#22c55e', fontWeight: '700' },
    status3xx: { color: '#38bdf8', fontWeight: '700' },
    status4xx: { color: '#f59e0b', fontWeight: '700' },
    status5xx: { color: '#ef4444', fontWeight: '700' },
});
