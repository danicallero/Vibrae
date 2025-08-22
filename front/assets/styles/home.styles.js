// styles/home.styles.js
import { StyleSheet, Platform } from "react-native";
import { COLORS } from "../../constants/Colors";
import { glassTint, subtleShadow, hexToRgba } from "./theme";

const TINT = 0.055;
const SURFACE = glassTint({ color: COLORS.primary, alpha: TINT, blur: 10 });

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    flex: 1,
    padding: 20,
    paddingBottom: 0,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
    paddingVertical: 6,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerLogo: {
    width: 56,
    height: 56,
    borderRadius: 12,
    overflow: "hidden",
  },
  welcomeContainer: {
    justifyContent: "center",
  },
  welcomeText: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  usernameText: {
    fontSize: 16,
    fontWeight: "600",
    color: COLORS.text,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.text,
    paddingBottom: 8,
  },
  backButton: {
    padding: 8,
    borderRadius: 12,
  },
  addButton: {
    ...SURFACE,
    ...subtleShadow({ spread: 8 }),
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS !== "web" ? { backgroundColor: COLORS.primary } : {}),
  },
  addButtonText: {
    color: COLORS.text,
    fontWeight: "700",
    marginLeft: 8,
  },
  logoutButton: {
    padding: 8,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    ...Platform.select({ web: { backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.03)" }, default: { backgroundColor: COLORS.card } }),
  },
  balanceCard: {
    ...SURFACE,
    ...subtleShadow({ spread: 10 }),
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    ...(Platform.OS !== "web" ? { backgroundColor: COLORS.card } : { borderColor: hexToRgba(COLORS.primary, 0.06) }),
  },
  balanceTitle: {
    fontSize: 14,
    color: COLORS.textLight,
    marginBottom: 6,
  },
  balanceAmount: {
    fontSize: 28,
    fontWeight: "800",
    color: COLORS.text,
    marginBottom: 12,
  },
  balanceStats: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  balanceStatItem: {
    flex: 1,
    alignItems: "center",
  },
  statDivider: {
    borderRightWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  balanceStatLabel: {
    fontSize: 13,
    color: COLORS.textLight,
    marginBottom: 6,
  },
  balanceStatAmount: {
    fontSize: 16,
    fontWeight: "700",
    color: COLORS.primary,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 12,
  },
  transactionCard: {
    ...glassTint({ color: COLORS.primary, alpha: TINT * 0.6, blur: 8 }),
    borderRadius: 14,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    ...(Platform.OS !== "web" ? { backgroundColor: COLORS.card } : {}),
  },
  transactionContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
  },
  categoryIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: hexToRgba(COLORS.primary, 0.08),
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  transactionLeft: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.text,
  },
  transactionCategory: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  transactionRight: {
    alignItems: "flex-end",
  },
  transactionAmount: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.text,
  },
  transactionDate: {
    fontSize: 12,
    color: COLORS.textLight,
  },
  deleteButton: {
    ...glassTint({ color: COLORS.expense, alpha: 0.7, blur: 10 }),
    ...subtleShadow({ spread: 15 }),
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    ...(Platform.OS !== "web" ? { backgroundColor: COLORS.expense } : {}),
  },
  transactionsContainer: {
    marginBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingVertical: 24,
  },
  emptyState: {
    ...SURFACE,
    borderRadius: 16,
    padding: 26,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    ...(Platform.OS !== "web" ? { backgroundColor: COLORS.card } : {}),
  },
  emptyStateIcon: {
    marginBottom: 14,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: 8,
  },
  emptyStateText: {
    color: COLORS.textLight,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 18,
    lineHeight: 20,
  },
  emptyStateButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: "row",
    alignItems: "center",
  },
  emptyStateButtonText: {
    color: COLORS.white,
    fontWeight: "700",
    marginLeft: 8,
  },
  footer: {
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.04)",
    alignItems: "center",
    backgroundColor: "transparent",
  },
  footerText: {
    color: COLORS.textLight,
    fontSize: 12,
  },
  smallMuted: {
    fontSize: 12,
    color: COLORS.textLight,
  },
});