// styles/create.styles.js
import { StyleSheet, Platform } from "react-native";
import { COLORS } from "../../constants/Colors";
import { hexToRgba, glassTint, subtleShadow } from "./theme";

const TINT = 0.055;
const CARD_GLASS = glassTint({ color: COLORS.primary, alpha: TINT, blur: 10 });

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: Platform.OS === "web" ? 0 : 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.text,
  },
  backButton: {
    padding: 8,
    borderRadius: 10,
  },
  saveButtonContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButton: {
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: "600",
  },
  card: {
    ...CARD_GLASS,
    ...subtleShadow({ spread: 10 }),
    margin: 16,
    borderRadius: 14,
    padding: 16,
    ...(Platform.OS !== "web" ? { backgroundColor: COLORS.card } : { borderColor: hexToRgba(COLORS.primary, 0.04) }),
  },
  typeSelector: {
    flexDirection: "row",
    marginBottom: 18,
    gap: 10,
  },
  typeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 22,
    borderWidth: 0,
    backgroundColor: Platform.OS === "web" ? "rgba(255,255,255,0.02)" : COLORS.background,
  },
  typeButtonActive: {
    backgroundColor: COLORS.primary,
  },
  typeIcon: {
    marginRight: 8,
  },
  typeButtonText: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: "600",
  },
  typeButtonTextActive: {
    color: COLORS.white,
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 12,
    marginBottom: 18,
  },
  currencySymbol: {
    fontSize: 32,
    fontWeight: "700",
    color: COLORS.text,
    marginRight: 8,
  },
  amountInput: {
    flex: 1,
    fontSize: 34,
    fontWeight: "700",
    color: COLORS.text,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 6,
    marginBottom: 16,
    backgroundColor: Platform.OS === "web" ? "rgba(255,255,255,0.02)" : COLORS.white,
  },
  inputIcon: {
    marginHorizontal: 12,
  },
  input: {
    flex: 1,
    padding: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 12,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
  },
  categoryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  categoryButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 0,
    backgroundColor: Platform.OS === "web" ? "rgba(255,255,255,0.02)" : COLORS.white,
  },
  categoryButtonActive: {
    backgroundColor: COLORS.primary,
  },
  categoryIcon: {
    marginRight: 8,
  },
  categoryButtonText: {
    color: COLORS.text,
    fontSize: 14,
  },
  categoryButtonTextActive: {
    color: COLORS.white,
  },
  loadingContainer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
