// styles/scenes.styles.js
import { StyleSheet, Platform } from "react-native";
import { COLORS } from "../../constants/Colors";
import { hexToRgba, glassTint, subtleShadow, readableModalBg } from "./theme";

const TINT = 0.04;
const MODAL_GLASS = glassTint({ color: COLORS.primary, alpha: TINT, blur: 14 });

export const sceneStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: "100%",
    maxWidth: 760,
    borderRadius: 14,
    padding: 18,
    ...(Platform.OS === "web" ? { backgroundColor: readableModalBg(0.94), backdropFilter: "blur(14px)" } : { backgroundColor: COLORS.card }),
    ...subtleShadow({ spread: 14 }),
    borderColor: hexToRgba(COLORS.primary, 0.04),
    borderWidth: Platform.OS === "web" ? 1 : 0,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 10,
  },
  modalText: {
    fontSize: 14,
    color: COLORS.text,
    marginBottom: 12,
  },
  input: {
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 12,
    color: COLORS.text,
    ...(Platform.OS === "web" ? { backgroundColor: hexToRgba(COLORS.white, 0.98), borderWidth: 1, borderColor: hexToRgba(COLORS.primary, 0.02) } : { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border }),
  },
  tag: {
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 8,
    marginTop: 6,
    backgroundColor: hexToRgba(COLORS.primary, 0.09),
    borderColor: hexToRgba(COLORS.primary, 0.14),
    borderWidth: 1,
  },
  tagText: {
    fontSize: 12,
    color: COLORS.text,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    marginTop: 6,
  },
  actionButtonPrimary: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  actionButtonPrimaryText: {
    color: COLORS.white,
    fontWeight: "700",
  },
  actionButtonSecondary: {
    backgroundColor: hexToRgba(COLORS.text, 0.06),
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: hexToRgba(COLORS.text, 0.04),
  },
  actionButtonSecondaryText: {
    color: COLORS.text,
    fontWeight: "600",
  },
});