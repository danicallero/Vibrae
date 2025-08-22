// assets/components/GlassView.tsx
import React from "react";
import { Platform, View, ViewStyle } from "react-native";
import { BlurView } from "expo-blur"; // expo-blur -> funciona iOS + Android (Expo)
// si no usas Expo, usa @react-native-community/blur y adapta la importación
import { hexToRgba } from "../styles/theme";
import { COLORS } from "../../constants/Colors";

type GlassProps = {
  children?: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  intensity?: number; // blur intensity native
  tint?: "light" | "dark" | "default";
  overlayAlpha?: number; // color tint overlay alpha (0..1)
};

export default function GlassView({ children, style, intensity = 60, tint = "default", overlayAlpha = 0.06 }: GlassProps) {
  // web: no BlurView, usamos backdropFilter via styles (already en theme glassTint)
  if (Platform.OS === "web") {
    // simplemente renderiza un View: espera que tus estilos web ya incluyan backdropFilter/backdrop styles
    return <View style={style}>{children}</View>;
  }

  // native: BlurView no pinta color por defecto, por eso añadimos una capa interior con tint (para el glass color)
  const overlayColor = hexToRgba(COLORS.primary, overlayAlpha); // ligero tint usando primary
  return (
    <BlurView intensity={intensity} tint={tint} style={Array.isArray(style) ? style : [style]}>
      {/* La capa interna asegura el tint y el radio heredado */}
      <View style={{ flex: 1, backgroundColor: overlayColor, borderRadius: (Array.isArray(style) ? (style[0] as any)?.borderRadius : (style as any)?.borderRadius) ?? 12, overflow: "hidden" }}>
        {children}
      </View>
    </BlurView>
  );
}
