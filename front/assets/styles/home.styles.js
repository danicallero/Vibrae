// SPDX-License-Identifier: GPL-3.0-or-later
// styles/home.styles.js

import { StyleSheet } from "react-native";
import { COLORS } from "../../constants/Colors";

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  content: {
    padding: 20,
    paddingBottom: 0,
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.primaryEnd,
    paddingBottom: 12,
  },
  addButton: {
    backgroundColor: COLORS.primaryMid,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primaryEnd,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  addButtonText: {
    color: COLORS.white,
    fontWeight: "600",
    marginLeft: 4,
  },
  balanceCard: {
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    shadowColor: COLORS.primaryMid,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  balanceTitle: {
    fontSize: 16,
    color: COLORS.primaryMid,
    marginBottom: 8,
  },
  balanceAmount: {
    fontSize: 32,
    fontWeight: "bold",
    color: COLORS.primaryEnd,
    marginBottom: 20,
  },
  emptyState: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 30,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 10,
    shadowColor: COLORS.primaryMid,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: COLORS.primaryEnd,
    marginBottom: 8,
  },
  emptyStateText: {
    color: COLORS.primaryMid,
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
});