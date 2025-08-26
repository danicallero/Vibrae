import React, { useCallback, useEffect, useState } from 'react';
import { SafeAreaView, View, Text, TouchableOpacity, ActivityIndicator, TextInput, Platform, RefreshControl, ScrollView, Pressable, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { API_URL } from '@env';
import { getToken, deleteToken } from '../../lib/storage';
import { styles } from '../../assets/styles/logs.styles';

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
      const token = await getToken();
      if (!token) {
        router.replace('/auth/login');
        return;
      }
      const res = await fetch(`${API_URL}/logs/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        await deleteToken();
        router.replace('/auth/login');
        return;
      }
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
      const token = await getToken();
      const t = parseInt(tail, 10);
      const res = await fetch(
        `${API_URL}/logs/content?file=${encodeURIComponent(selected.file)}&history=${selected.history ? 'true' : 'false'}&tail=${isFinite(t) && t > 0 ? t : 300}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const text = await res.text();
      setContent(text);
    } catch (e: any) {
      setContent(`Error: ${e?.message || 'Failed to load content'}`);
    }
  }, [selected, tail]);

  const fetchPerLogHistory = useCallback(async (baseFile: string) => {
    try {
      const token = await getToken();
      const base = baseFile.endsWith('.log') ? baseFile : `${baseFile}.log`;
      const res = await fetch(`${API_URL}/logs/history?base=${encodeURIComponent(base)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
              <TouchableOpacity style={styles.btn} onPress={fetchContent}>
                <Text style={styles.btnText}>Refresh</Text>
              </TouchableOpacity>
              {selected && (
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
          </View>
          <ScrollView style={styles.content} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
            <Text style={styles.mono}>{selected ? content : 'Select a file to view.'}</Text>
          </ScrollView>
        </View>
      </View>

      {isSmall && sidebarOpen && (
        <View style={styles.overlay}>
          <View style={styles.sidebarSheet}>
            <View style={styles.sidebarHeader}>
              <Text style={styles.section}>Logs</Text>
              <TouchableOpacity style={[styles.btn, { backgroundColor: '#6b7280' }]} onPress={() => setSidebarOpen(false)}>
                <Text style={styles.btnText}>Close</Text>
              </TouchableOpacity>
            </View>
            {SidebarContent}
          </View>
          <Pressable style={styles.backdrop} onPress={() => setSidebarOpen(false)} />
        </View>
      )}
    </SafeAreaView>
  );
}

// styles imported from ../../assets/styles/logs.styles
