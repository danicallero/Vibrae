// SPDX-License-Identifier: GPL-3.0-or-later
// styles/scenes.styles.js

import { StyleSheet } from "react-native";
import { COLORS } from "../../constants/Colors";

export const sceneStyles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContainer: {
    width: "100%",
    backgroundColor: COLORS.card,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  input: {
    backgroundColor: COLORS.background,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 16,
    color: COLORS.text,
  },
  tag: {
    backgroundColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 6,
    marginTop: 6,
    alignSelf: "flex-start",
},
tagText: {
    fontSize: 12,
    color: COLORS.text,
},

});
