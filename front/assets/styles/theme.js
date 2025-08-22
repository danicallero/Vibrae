// styles/theme.js
import { Platform } from "react-native";
import { COLORS } from "../../constants/Colors";

export const hexToRgba = (hex, alpha = 1) => {
  if (!hex) return `rgba(0,0,0,${alpha})`;
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.substring(0, 2), 16);
  const g = parseInt(h.substring(2, 4), 16);
  const b = parseInt(h.substring(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

export const glassTint = ({ color = COLORS.primary, alpha = 0.06, blur = 10 } = {}) => {
  const bg = hexToRgba(color, alpha);
  const border = hexToRgba(color, Math.min(alpha * 2, 0.12));
  if (Platform.OS === "web") {
    return {
      backgroundColor: bg,
      borderColor: border,
      borderWidth: 1,
      backdropFilter: `blur(${blur}px)`,
    };
  }
  return {
    backgroundColor: hexToRgba(color, Math.min(alpha * 2.5, 0.12)),
  };
};

export const subtleShadow = ({ spread = 8, opacity = 0.06 } = {}) => ({
  shadowColor: "#000",
  shadowOffset: { width: 0, height: Math.max(1, Math.floor(spread / 3)) },
  shadowOpacity: Platform.OS === "web" ? 0.03 : opacity,
  shadowRadius: spread,
  elevation: 2,
});

// Quick contrast helper used for modals: returns a white-ish overlay for best readability on web
export const readableModalBg = (alpha = 0.92) => {
  if (Platform.OS === "web") return hexToRgba(COLORS.white, alpha);
  return COLORS.card;
};
