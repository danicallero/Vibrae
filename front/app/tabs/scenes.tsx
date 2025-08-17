import { useEffect, useState } from "react";
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
} from "react-native";
  // DismissKeyboardWrapper for modal, like in routines
  const DismissKeyboardWrapper = ({ children }: { children: React.ReactNode }) => {
    if (Platform.OS === 'web') return <>{children}</>;
    return (
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        {children}
      </TouchableWithoutFeedback>
    );
  };
import { Ionicons } from "@expo/vector-icons";
import { styles } from "../../assets/styles/home.styles";
import { sceneStyles } from "../../assets/styles/scenes.styles";
import { COLORS } from "../../constants/Colors";
import { getToken } from "../../lib/storage";
import { useRouter, useNavigation } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import DropDownPicker from "react-native-dropdown-picker";
import { API_URL } from "@env";

type Scene = {
  id: number;
  name: string;
  path: string;
  // add other properties if needed
};

export default function ScenesPage() {
  const router = useRouter();
  const navigation = useNavigation();
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
      setScenes((prev) =>
        JSON.stringify(prev) !== JSON.stringify(data) ? data : prev
      );
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
      setFolders(data.folders);
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
      <View style={{
        paddingTop: Platform.OS === "ios" ? 10 : 10,
        paddingHorizontal: 10,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={{
            padding: 5,
            borderRadius: 30,
          }}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name="chevron-back" size={28} color={COLORS.text} />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={fetchScenes}
          style={{
            padding: 5,
            borderRadius: 30,
          }}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        >
          <Ionicons name="refresh" size={24} color={COLORS.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        <Text style={styles.headerTitle}>Escenas</Text>
        <Text style={{ color: COLORS.textLight, fontSize: 14, marginBottom: 24 }}>
          Crea y administra tus escenas musicales
        </Text>

        <TouchableOpacity
          style={[styles.addButton, { marginBottom: 24 }]}
          onPress={() => {
            setShowModal(true);
            setIsEditing(false);
            setName("");
            setSelectedPath(null);
          }}
        >
          <Ionicons name="add" size={20} color="#fff" />
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
                <Text style={{ fontSize: 20, fontWeight: "600", color: COLORS.text }}>{item.name}</Text>
                <Text style={{ fontSize: 15, color: COLORS.textLight }}>Carpeta: {item.path}</Text>
              </View>

              <TouchableOpacity
                onPress={() => setOptionsSceneId(item.id)}
                style={{ padding: 10, borderRadius: 20 }}
              >
                <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>
          )}
        />

        {/* Create/edit modal */}
        <Modal visible={showModal} animationType="slide" transparent>
          <DismissKeyboardWrapper>
            {Platform.OS === 'web' ? (
              <View style={sceneStyles.modalOverlay}>
                <View style={sceneStyles.modalContainer}>
                  <Text style={styles.headerTitle}>
                    {isEditing ? "Editar escena" : "Nueva escena"}
                  </Text>

                  <TextInput
                    placeholder="Nombre de la escena"
                    style={sceneStyles.input}
                    value={name}
                    onChangeText={setName}
                  />

                  <View style={{ zIndex: 1000 }}>
                    <DropDownPicker
                      open={openPicker}
                      value={selectedPath}
                      items={folders.map((folder) => ({
                        label: folder,
                        value: folder,
                      }))}
                      setOpen={setOpenPicker}
                      setValue={setSelectedPath}
                      placeholder="Selecciona una carpeta"
                      style={{
                        borderColor: COLORS.border,
                        marginBottom: 16,
                      }}
                      dropDownContainerStyle={{
                        borderColor: COLORS.border,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
                    <TouchableOpacity
                      onPress={resetModalState}
                      style={[styles.addButton, { backgroundColor: COLORS.border }]}
                    >
                      <Text style={styles.addButtonText}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={isEditing ? handleUpdateScene : createScene}
                      style={[styles.addButton]}
                    >
                      <Text style={styles.addButtonText}>
                        {isEditing ? "Actualizar" : "Crear"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={sceneStyles.modalOverlay}
              >
                <View style={sceneStyles.modalContainer}>
                  <Text style={styles.headerTitle}>
                    {isEditing ? "Editar escena" : "Nueva escena"}
                  </Text>

                  <TextInput
                    placeholder="Nombre de la escena"
                    style={sceneStyles.input}
                    value={name}
                    onChangeText={setName}
                  />

                  <View style={{ zIndex: 5000 }}>
                    <DropDownPicker
                      open={openPicker}
                      value={selectedPath}
                      items={folders.map((folder) => ({
                        label: folder,
                        value: folder,
                      }))}
                      setOpen={setOpenPicker}
                      setValue={setSelectedPath}
                      placeholder="Selecciona una carpeta"
                      style={{
                        borderColor: COLORS.border,
                        marginBottom: 16,
                      }}
                    />
                  </View>

                  <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 12 }}>
                    <TouchableOpacity
                      onPress={resetModalState}
                      style={[styles.addButton, { backgroundColor: COLORS.border }]}
                    >
                      <Text style={styles.addButtonText}>Cancelar</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={isEditing ? handleUpdateScene : createScene}
                      style={[styles.addButton]}
                    >
                      <Text style={styles.addButtonText}>
                        {isEditing ? "Actualizar" : "Crear"}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </KeyboardAvoidingView>
            )}
          </DismissKeyboardWrapper>
        </Modal>

        {/* Options modal */}
        <Modal visible={!!optionsSceneId} animationType="fade" transparent>
          <TouchableWithoutFeedback onPress={() => setOptionsSceneId(null)}>
            <View style={sceneStyles.modalOverlay}>
              <View style={sceneStyles.modalContainer}>
                <Text style={styles.headerTitle}>Opciones de escena</Text>

                <TouchableOpacity
                  onPress={() => {
                    const scene = scenes.find((s) => s.id === optionsSceneId);
                    if (scene) startEditScene(scene);
                    setOptionsSceneId(null);
                  }}
                  style={[styles.addButton, { marginBottom: 5 }]}
                >
                  <Text style={styles.addButtonText}>Editar escena</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => {
                    if (optionsSceneId != null) deleteScene(optionsSceneId);
                    setOptionsSceneId(null);
                  }}
                  style={[styles.addButton, { backgroundColor: COLORS.expense }]}
                >
                  <Text style={styles.addButtonText}>Eliminar escena</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setOptionsSceneId(null)}
                  style={[styles.addButton, { backgroundColor: COLORS.border, marginTop: 12 }]}
                >
                  <Text style={styles.addButtonText}>Cancelar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </SafeAreaView>
  );
}
