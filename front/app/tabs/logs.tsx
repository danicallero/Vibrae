// SPDX-License-Identifier: GPL-3.0-or-later
// app/tabs/logs.tsx

import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, ActivityIndicator, TextInput, Platform, RefreshControl, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { SafeAreaView as SafeAreaViewCtx } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { API_URL } from '@env';
import { apiFetch } from '../../lib/api';
import { styles } from '../../assets/styles/logs.styles';
import { COLORS } from '@/constants/Colors';

type LogFile = {
  name: string;
  size: number;
  mtime: number; // epoch seconds
};

type LogsIndex = {
  current: LogFile[];
  history: LogFile[];
};

export default function LogsScreen() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isSmall = width < 780;
  const [index, setIndex] = useState<LogsIndex>({ current: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ file: string; history: boolean } | null>(null);
  const [content, setContent] = useState<string>('');
  const [coloredLines, setColoredLines] = useState<Array<{ key: string; parts: Array<{ text: string; style: any }> }>>([]);
  const [tail, setTail] = useState<string>('300');
  const [refreshing, setRefreshing] = useState(false);
  const [perLogHistory, setPerLogHistory] = useState<LogFile[]>([]);
  const [showingHistoryItem, setShowingHistoryItem] = useState<boolean>(false);
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(false);

  // Open sidebar by default on large screens; keep closed on small screens
  useEffect(() => {
    setSidebarOpen(!isSmall);
  }, [isSmall]);

  const fetchIndex = useCallback(async () => {
    try {
      setError(null);
      const res = await apiFetch(`${API_URL}/logs/`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as LogsIndex;
      setIndex(data);
    } catch (e: any) {
      setError(e?.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [router]);

  const fetchContent = useCallback(async () => {
    if (!selected) return;
    try {
      const t = parseInt(tail, 10);
      const res = await apiFetch(
        `${API_URL}/logs/content?file=${encodeURIComponent(selected.file)}&history=${selected.history ? 'true' : 'false'}&tail=${isFinite(t) && t > 0 ? t : 300}`
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const text = await res.text();
  setContent(text);
  setColoredLines(parseLogToColored(text));
    } catch (e: any) {
  const err = `Error: ${e?.message || 'Failed to load content'}`;
  setContent(err);
  setColoredLines(parseLogToColored(err));
    }
  }, [selected, tail]);

  const fetchPerLogHistory = useCallback(async (baseFile: string) => {
    try {
      const base = baseFile.endsWith('.log') ? baseFile : `${baseFile}.log`;
      const res = await apiFetch(`${API_URL}/logs/history?base=${encodeURIComponent(base)}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = await res.json();
      setPerLogHistory((data.history || []) as LogFile[]);
    } catch (e) {
      setPerLogHistory([]);
    }
  }, []);


  useEffect(() => {
    fetchIndex();
  }, [fetchIndex]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  // When selecting a current file, load its history list; when selecting a history item, don't fetch per-log history again
  useEffect(() => {
    if (!selected) {
      setPerLogHistory([]);
      setShowingHistoryItem(false);
      return;
    }
  const base = selected.history ? `${(selected.file.split('-')[0] || '').trim()}.log` : selected.file;
  fetchPerLogHistory(base);
  }, [selected, fetchPerLogHistory]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchIndex();
    await fetchContent();
    if (selected && !selected.history) {
      await fetchPerLogHistory(selected.file);
    }
    setRefreshing(false);
  }, [fetchIndex, fetchContent, fetchPerLogHistory, selected]);

  const renderFile = (file: LogFile, history: boolean) => (
    <TouchableOpacity
      key={(history ? 'h:' : 'c:') + file.name}
      style={[styles.item, selected?.file === file.name && selected?.history === history && styles.itemSelected]}
      onPress={() => {
        setSelected({ file: file.name, history });
        if (isSmall) setSidebarOpen(false);
      }}
    >
      <Text style={styles.fileName}>{file.name}</Text>
      <Text style={styles.meta}>{new Date(file.mtime * 1000).toLocaleString()} • {(file.size / 1024).toFixed(1)} KB</Text>
    </TouchableOpacity>
  );

  const SidebarContent = (
    <View style={styles.leftPaneContent}>
      <Text style={styles.section}>Current</Text>
      <ScrollView style={styles.list}>
        {index.current.map(f => renderFile(f, false))}
      </ScrollView>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.center}>
        <ActivityIndicator />
      </SafeAreaView>
    );
  }

  const parseLogToColored = (text: string) => {
    const lines = text.split(/\r?\n/);
    const items: Array<{ key: string; parts: Array<{ text: string; style: any }> }> = [];
    const levelStyles: Record<string, any> = {
      INFO: [styles.level, styles.levelInfo],
      WARNING: [styles.level, styles.levelWarn],
      WARN: [styles.level, styles.levelWarn],
      ERROR: [styles.level, styles.levelError],
      CRITICAL: [styles.level, styles.levelCritical],
      DEBUG: [styles.level, styles.levelDebug],
    };
    const timeRegex = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:,\d{3})?)/;
  const headRegex = /^----- .* start .* -----$/i;
  // Python logging format with logger
    const stdRegex = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+(INFO|WARNING|WARN|ERROR|CRITICAL|DEBUG)\s+([^:]+):\s+(.*)$/;
  // Generic: timestamp level message (no logger)
  const stdNoLoggerRegex = /^(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:,\d{3})?)\s+(INFO|WARNING|WARN|ERROR|CRITICAL|DEBUG)\s+(.*)$/;
    // Uvicorn default: "INFO:     127.0.0.1:8000 - \"GET / HTTP/1.1\" 200 OK"
    const uvicornRegex = /^(INFO|WARNING|ERROR|DEBUG|TRACE):\s+(.*)$/;
    // Cloudflared style: YYYY-MM-DDT..Z INF/WRN/ERR ...
  const cloudflaredRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(INF|WRN|ERR|DBG)\s+(.*)$/;
    // Nginx access log common: IP - - [date] "METHOD path HTTP/x" status size "ref" "ua"
    const nginxRegex = /^(\S+)\s+-\s+-\s+\[([^\]]+)\]\s+"(\S+)\s+([^"\s]+)(?:\s+HTTP\/[0-9.]+)?"\s+(\d{3})\s+(\d+|-)/;
    let stackMode = false;
    lines.forEach((line, idx) => {
      const key = `${idx}`;
      if (!line) {
        items.push({ key, parts: [{ text: '\n', style: styles.mono }] });
        stackMode = false;
        return;
      }
      if (headRegex.test(line)) {
        items.push({ key, parts: [{ text: line, style: [styles.mono, styles.headerLine] }] });
        stackMode = false;
        return;
      }
      // Nginx access logs
      const ng = nginxRegex.exec(line);
      if (ng) {
        const [, ip, date, method, path, status] = ng;
        const statusNum = parseInt(status, 10);
        const statusStyle = statusNum >= 500
          ? styles.status5xx
          : statusNum >= 400
          ? styles.status4xx
          : statusNum >= 300
          ? styles.status3xx
          : styles.status2xx;
        const methodStyle =
          method === 'GET' ? [styles.method, styles.methodGet]
          : method === 'POST' ? [styles.method, styles.methodPost]
          : method === 'PUT' ? [styles.method, styles.methodPut]
          : method === 'DELETE' ? [styles.method, styles.methodDelete]
          : [styles.method, styles.methodOther];
        items.push({
          key,
          parts: [
            { text: ip + ' ', style: [styles.mono, styles.ip] },
            { text: `[${date}] `, style: [styles.mono, styles.bracketDate] },
            { text: method + ' ', style: [styles.mono, ...methodStyle] },
            { text: path + ' ', style: [styles.mono, styles.path] },
            { text: status, style: [styles.mono, statusStyle] },
          ],
        });
        stackMode = false;
        return;
      }
      const m = stdRegex.exec(line);
      if (m) {
        const [, ts, lvl, logger, msg] = m;
        const lvlStyle = levelStyles[lvl] || styles.level;
        items.push({
          key,
          parts: [
            { text: ts + ' ', style: [styles.mono, styles.time] },
            { text: lvl + ' ', style: [styles.mono, ...[].concat(lvlStyle)] },
            { text: logger + ': ', style: [styles.mono, styles.logger] },
            { text: msg, style: [styles.mono, styles.message] },
          ],
        });
        stackMode = lvl === 'ERROR' || lvl === 'CRITICAL';
        return;
      }
      // Timestamp + level + rest (backend/serve simple format)
      const ml = stdNoLoggerRegex.exec(line);
      if (ml) {
        const [, ts, lvl, rest] = ml;
        const lvlStyle = levelStyles[lvl] || styles.level;
        items.push({
          key,
          parts: [
            { text: ts + ' ', style: [styles.mono, styles.time] },
            { text: lvl + ' ', style: [styles.mono, ...[].concat(lvlStyle)] },
            { text: rest, style: [styles.mono, styles.message] },
          ],
        });
        stackMode = lvl === 'ERROR' || lvl === 'CRITICAL';
        return;
      }
      // Uvicorn / other colon-separated levels
      const uv = uvicornRegex.exec(line);
      if (uv) {
        const [, lvl, rest] = uv;
        const lvlUpper = lvl.toUpperCase();
        const lvlStyle = levelStyles[lvlUpper] || styles.level;
        items.push({ key, parts: [
          { text: lvlUpper + ': ', style: [styles.mono, ...[].concat(lvlStyle)] },
          { text: rest, style: [styles.mono, styles.message] },
        ]});
        stackMode = lvlUpper === 'ERROR' || lvlUpper === 'CRITICAL';
        return;
      }
      // Cloudflared compact level codes
      const cf = cloudflaredRegex.exec(line);
      if (cf) {
        const [, ts, lvl, rest] = cf;
        const map: Record<string, string> = { INF: 'INFO', WRN: 'WARNING', ERR: 'ERROR', DBG: 'DEBUG' };
        const lvlFull = map[lvl] || lvl;
        const lvlStyle = levelStyles[lvlFull] || styles.level;
        items.push({ key, parts: [
          { text: ts + ' ', style: [styles.mono, styles.time] },
          { text: lvlFull + ' ', style: [styles.mono, ...[].concat(lvlStyle)] },
          { text: rest, style: [styles.mono, styles.message] },
        ]});
        stackMode = lvlFull === 'ERROR' || lvlFull === 'CRITICAL';
        return;
      }
      if (stackMode || line.startsWith('Traceback ') || line.startsWith('  File ') || line.trim().startsWith('File ')) {
        items.push({ key, parts: [{ text: line, style: [styles.mono, styles.stackLine] }] });
        return;
      }
      // Fallback: timestamp-only lines (no level)
      const tm = timeRegex.exec(line);
      if (tm) {
        items.push({ key, parts: [{ text: line, style: [styles.mono, styles.time] }] });
        return;
      }
      // Plain line
      items.push({ key, parts: [{ text: line, style: styles.mono }] });
    });
    return items;
  };

  return (
    <SafeAreaView style={styles.container}>
  {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.row}>
        {!isSmall && (
          <View style={styles.leftPane}>
            {SidebarContent}
          </View>
        )}
        <View style={styles.rightPane}>
          <View style={styles.controls}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                style={{ marginRight: 8, padding: 4 }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                onPress={() => router.back()}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
              </TouchableOpacity>
              {isSmall && (
                <TouchableOpacity style={[styles.btn, { marginRight: 8 }]} onPress={() => setSidebarOpen(true)}>
                  <Text style={styles.btnText}>Select Logs</Text>
                </TouchableOpacity>
              )}
              <Text style={styles.section}>Content</Text>
            </View>
            <View style={styles.tailRow}>
              <Text style={styles.meta}>Tail lines:</Text>
              <TextInput
                value={tail}
                onChangeText={setTail}
                keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                style={styles.tailInput}
                placeholder="300"
              />
              <TouchableOpacity
                style={styles.btn}
                onPress={fetchContent}
                accessibilityRole="button"
                accessibilityLabel="Refresh"
              >
                <Text style={styles.btnText}>Refresh</Text>
              </TouchableOpacity>
              {!isSmall && selected && (
                <View style={styles.historyChipsRow}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
                    {(() => {
                      const base = selected.history ? `${(selected.file.split('-')[0] || '').trim()}.log` : selected.file;
                      return (
                        <TouchableOpacity
                          style={[styles.chip, !selected.history && styles.chipActive]}
                          onPress={() => setSelected({ file: base, history: false })}
                        >
                          <Text style={[styles.chipText, !selected.history && styles.chipTextActive]}>Latest</Text>
                        </TouchableOpacity>
                      );
                    })()}
                    {perLogHistory.map((f) => {
                      const m = f.name.match(/-(\d{8})-(\d{6})\.log$/);
                      let label: string;
                      if (m) {
                        const d = m[1];
                        const t = m[2];
                        label = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)} ${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}`;
                      } else {
                        label = new Date(f.mtime * 1000).toLocaleString();
                      }
                      const active = selected?.history && selected.file === f.name;
                      return (
                        <TouchableOpacity
                          key={`chip:${f.name}`}
                          style={[styles.chip, active && styles.chipActive]}
                          onPress={() => setSelected({ file: f.name, history: true })}
                        >
                          <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
            {isSmall && selected && (
              <View style={[styles.historyChipsRow, { marginTop: 8 }]}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
                  {(() => {
                    const base = selected.history ? `${(selected.file.split('-')[0] || '').trim()}.log` : selected.file;
                    return (
                      <TouchableOpacity
                        style={[styles.chip, !selected.history && styles.chipActive]}
                        onPress={() => setSelected({ file: base, history: false })}
                      >
                        <Text style={[styles.chipText, !selected.history && styles.chipTextActive]}>Latest</Text>
                      </TouchableOpacity>
                    );
                  })()}
                  {perLogHistory.map((f) => {
                    const m = f.name.match(/-(\d{8})-(\d{6})\.log$/);
                    let label: string;
                    if (m) {
                      const d = m[1];
                      const t = m[2];
                      label = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)} ${t.slice(0, 2)}:${t.slice(2, 4)}:${t.slice(4)}`;
                    } else {
                      label = new Date(f.mtime * 1000).toLocaleString();
                    }
                    const active = selected?.history && selected.file === f.name;
                    return (
                      <TouchableOpacity
                        key={`chip:${f.name}`}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => setSelected({ file: f.name, history: true })}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}
          </View>
          <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            {selected ? (
              <View>
                {coloredLines.map(({ key, parts }) => (
                  <Text key={key} style={styles.mono}>
                    {parts.map((p, i) => (
                      <Text key={`${key}-${i}`} style={p.style}>{p.text}</Text>
                    ))}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={styles.mono}>Select a file to view.</Text>
            )}
          </ScrollView>
        </View>
      </View>

      {isSmall && sidebarOpen && (
        <View style={styles.overlay}>
          <SafeAreaViewCtx edges={['top']} style={styles.sidebarSheet}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.section}>Logs</Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: '#6b7280' }]} onPress={() => setSidebarOpen(false)}>
                <Text style={styles.btnText}>Close</Text>
              </TouchableOpacity>
            </View>
            {SidebarContent}
          </SafeAreaViewCtx>
          <Pressable style={styles.backdrop} onPress={() => setSidebarOpen(false)} />
        </View>
      )}
    </SafeAreaView>
  );
}
