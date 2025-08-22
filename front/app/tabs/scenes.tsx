// app/tabs/scenes.tsx
import React, {JSX, useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  FlatList,
  Modal,
  TextInput,
  Keyboard,
  Platform,
  TouchableWithoutFeedback,
  KeyboardAvoidingView,
  SafeAreaView,
  StyleSheet,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../assets/styles/home.styles";
import { sceneStyles } from "../../assets/styles/scenes.styles";
import { COLORS } from "../../constants/Colors";
import { getToken } from "../../lib/storage";
import { useRouter } from "expo-router";
import DropDownPicker from "react-native-dropdown-picker";
import { API_URL } from "@env";

type Scene = {
  id: number;
  name: string;
  path: string;
};

export default function ScenesPage(): JSX.Element {
  const router = useRouter();
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openPicker, setOpenPicker] = useState(false);

  const [isEditing, setIsEditing] = useState(false);
  const [editingSceneId, setEditingSceneId] = useState<number | null>(null);
  const [optionsSceneId, setOptionsSceneId] = useState<number | null>(null);

  const [shouldRefetchScenes, setShouldRefetchScenes] = useState(false);

  const fetchScenes = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/scenes/`, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error("Failed to fetch scenes");
      const data = await res.json();
      setScenes(data);
    } catch (err) {
      console.error("Error fetching scenes:", err);
      Alert.alert("Error", "No se pudieron cargar las escenas.");
    } finally {
      setLoading(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/scenes/folders/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) throw new Error("Error al obtener carpetas");
      const data = await res.json();
      setFolders(data.folders || []);
    } catch (err) {
      Alert.alert("Error", "No se pudieron cargar las carpetas.");
    }
  };

  const createScene = async () => {
    if (!name || !selectedPath) {
      Alert.alert("Completa todos los campos");
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/scenes/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, path: selectedPath }),
      });

      if (!res.ok) throw new Error("Error creando escena");

      resetModalState();
      setShouldRefetchScenes(true);
    } catch (err) {
      Alert.alert("Error", "No se pudo crear la escena.");
    }
  };

  const handleUpdateScene = async () => {
    if (!name || !selectedPath || editingSceneId === null) {
      Alert.alert("Completa todos los campos");
      return;
    }

    try {
      const token = await getToken();
      const res = await fetch(`${API_URL}/scenes/${editingSceneId}/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name, path: selectedPath }),
      });

      if (!res.ok) throw new Error("Error actualizando escena");

      resetModalState();
      setShouldRefetchScenes(true);
    } catch (err) {
      Alert.alert("Error", "No se pudo actualizar la escena.");
    }
  };

  const deleteScene = async (id: number) => {
    try {
      const token = await getToken();
      await fetch(`${API_URL}/scenes/${id}/`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      fetchScenes();
    } catch (err) {
      Alert.alert("Error", "No se pudo eliminar la escena.");
    }
  };

  const startEditScene = (scene: any) => {
    setName(scene.name);
    setSelectedPath(scene.path);
    setEditingSceneId(scene.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const resetModalState = () => {
    setShowModal(false);
    setIsEditing(false);
    setEditingSceneId(null);
    setName("");
    setSelectedPath(null);
  };

  useEffect(() => {
    fetchFolders();
    fetchScenes();
  }, []);

  useEffect(() => {
    if (!showModal && shouldRefetchScenes) {
      const timeout = setTimeout(() => {
        fetchScenes();
        setShouldRefetchScenes(false);
      }, 300);
      return () => clearTimeout(timeout);
    }
  }, [showModal, shouldRefetchScenes]);

  return (
    <SafeAreaView style={styles.container}>
      <View
        style={{
          paddingTop: Platform.OS === "ios" ? 10 : 10,
          paddingHorizontal: 10,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity onPress={fetchScenes} style={styles.backButton} hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}>
          <Ionicons name="refresh" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.headerTitle}>Escenas</Text>
        <Text style={{ color: COLORS.textLight, fontSize: 14, marginBottom: 24 }}>Crea y administra tus escenas musicales</Text>

        <TouchableOpacity
          style={[styles.addButton, { marginBottom: 24 }]}
          onPress={() => {
            setShowModal(true);
            setIsEditing(false);
            setName("");
            setSelectedPath(null);
          }}
        >
          <Ionicons name="add" size={20} color={COLORS.textLight} />
          <Text style={styles.addButtonText}>Nueva escena</Text>
        </TouchableOpacity>

        <FlatList
          data={scenes}
          refreshing={loading}
          onRefresh={fetchScenes}
          keyExtractor={(item) => item.id.toString()}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <View
              style={[
                styles.balanceCard,
                {
                  marginBottom: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                },
              ]}
            >
              <View>
                <Text style={{ fontSize: 20, fontWeight: "800", color: COLORS.text }}>{item.name}</Text>
                <Text style={{ fontSize: 15, color: COLORS.textLight }}>Carpeta: {item.path}</Text>
              </View>

              <TouchableOpacity onPress={() => setOptionsSceneId(item.id)} style={{ padding: 10, borderRadius: 20 }}>
                <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>
          )}
        />

        {/* Create/edit modal */}
        <Modal visible={showModal} animationType="slide" transparent>
          <View style={sceneStyles.modalOverlay}>
            {/* background catcher: only this fills the whole screen and dismisses when clicked */}
            <TouchableWithoutFeedback
              onPress={() => {
                Keyboard.dismiss();
                setShowModal(false);
              }}
              accessible={false}
            >
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            {/* content: keyboardAvoiding for native; same on web is fine */}
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
              <View style={sceneStyles.modalContainer}>
                <Text style={[sceneStyles.modalTitle, { color: "#3b2a20" }]}>{isEditing ? "Editar escena" : "Nueva escena"}</Text>
                <Text style={sceneStyles.modalText}>Introduce un nombre y selecciona la carpeta donde está el audio.</Text>

                <TextInput
                  placeholder="Nombre de la escena"
                  placeholderTextColor={COLORS.text}
                  style={sceneStyles.input}
                  value={name}
                  onChangeText={setName}
                  autoCorrect={false}
                  autoCapitalize="sentences"
                />

                <View style={{ zIndex: 10000 }}>
                  <DropDownPicker
                    open={openPicker}
                    value={selectedPath}
                    items={folders.map((folder) => ({ label: folder, value: folder }))}
                    setOpen={setOpenPicker}
                    setValue={setSelectedPath}
                    placeholder="Selecciona una carpeta"
                    style={sceneStyles.input}
                    dropDownContainerStyle={{
                      borderColor: "rgba(0,0,0,0.06)",
                      backgroundColor: Platform.OS === "web" ? "rgba(255,255,255,0.98)" : COLORS.card,
                      zIndex: 10000,
                      elevation: 10,
                    }}
                    zIndex={10000}
                  />
                </View>

                <View style={sceneStyles.modalActions}>
                  <TouchableOpacity onPress={resetModalState} style={sceneStyles.actionButtonSecondary}>
                    <Text style={sceneStyles.actionButtonSecondaryText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={isEditing ? handleUpdateScene : createScene} style={sceneStyles.actionButtonPrimary}>
                    <Text style={sceneStyles.actionButtonPrimaryText}>{isEditing ? "Actualizar" : "Crear"}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        {/* Options modal */}
        <Modal visible={!!optionsSceneId} animationType="fade" transparent>
          <View style={sceneStyles.modalOverlay}>
            <TouchableWithoutFeedback onPress={() => setOptionsSceneId(null)} accessible={false}>
              <View style={StyleSheet.absoluteFill} />
            </TouchableWithoutFeedback>

            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ width: "100%" }}>
              <View style={sceneStyles.modalContainer}>
                <Text style={[sceneStyles.modalTitle, { color: "#3b2a20" }]}>Opciones de escena</Text>
                <Text style={sceneStyles.modalText}>Acciones disponibles para la escena seleccionada.</Text>

                <View style={sceneStyles.modalActions}>
                  <TouchableOpacity
                    onPress={() => {
                      const scene = scenes.find((s) => s.id === optionsSceneId);
                      if (scene) startEditScene(scene);
                      setOptionsSceneId(null);
                    }}
                    style={sceneStyles.actionButtonPrimary}
                  >
                    <Text style={sceneStyles.actionButtonPrimaryText}>Editar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      if (optionsSceneId != null) deleteScene(optionsSceneId);
                      setOptionsSceneId(null);
                    }}
                    style={[sceneStyles.actionButtonSecondary, { backgroundColor: COLORS.expense, borderColor: COLORS.expense }]}
                  >
                    <Text style={[sceneStyles.actionButtonSecondaryText, { color: COLORS.white }]}>Eliminar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setOptionsSceneId(null)} style={sceneStyles.actionButtonSecondary}>
                    <Text style={sceneStyles.actionButtonSecondaryText}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  );
}