// styles/auth.styles.js
import { StyleSheet, Platform } from "react-native";
import { COLORS } from "../../constants/Colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  illustration: {
    height: 300,
    width: 300,
    resizeMode: "contain",
    alignSelf: "center",
    marginBottom: 6,
  },

  title: {
    fontSize: 32,
    fontWeight: "800",
    color: COLORS.text,
    marginVertical: 0,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 13,
    fontWeight: "500",
    color: COLORS.textLight,
    marginVertical: 14,
    textAlign: "center",
  },

  input: {
    width: "100%",
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    fontSize: 16,
    color: COLORS.text,
    ...(Platform.OS === "web"
      ? { backgroundColor: "rgba(255,255,255,0.995)", borderColor: COLORS.border }
      : { backgroundColor: COLORS.white, borderColor: COLORS.border }),
  },

  errorInput: {
    borderColor: COLORS.expense,
  },

  button: {
    width: "100%",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
    marginTop: 8,
    backgroundColor: COLORS.primary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },

  buttonText: {
    color: COLORS.whiteText,
    fontSize: 18,
    fontWeight: "700",
  },

  footerContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },

  footerText: {
    color: COLORS.text,
    fontSize: 12,
  },

  linkText: {
    color: COLORS.primary,
    fontSize: 13,
    fontWeight: "600",
  },

  verificationContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
    justifyContent: "center",
    alignItems: "center",
  },

  verificationTitle: {
    fontSize: 24,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 20,
    textAlign: "center",
  },

  verificationInput: {
    backgroundColor: Platform.OS === "web" ? "rgba(255,255,255,0.995)" : COLORS.white,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    fontSize: 16,
    color: COLORS.text,
    width: "100%",
    textAlign: "center",
    letterSpacing: 2,
  },

  // Error
  errorBox: {
    backgroundColor: "#FFECEE",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.expense,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },

  errorText: {
    color: COLORS.expense,
    marginLeft: 8,
    flex: 1,
    fontSize: 14,
  },
});