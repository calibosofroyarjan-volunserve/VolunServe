import React from "react";
import { StyleSheet, View, type ViewProps } from "react-native";
import { volunserveUi as ui } from "../../constants/volunserveUi";

/** Shared, low-noise white surface for web and phone browsers. */
export default function VolunServeCard({
  children,
  style,
  ...props
}: ViewProps) {
  return (
    <View {...props} style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: ui.color.surface,
    borderColor: ui.color.border,
    borderWidth: 1,
    borderRadius: ui.radius.card,
    padding: ui.spacing.base,
  },
});
