import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { liveUi as ui } from "../../constants/volunserveLiveUi";

type Variant = "primary" | "secondary" | "danger" | "ghost";

export type VolunServeButtonProps = {
  label: string;
  onPress: () => void | Promise<void>;
  variant?: Variant;
  icon?: React.ComponentProps<typeof Ionicons>["name"];
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
};

/** A single accessible action style for Resident, Volunteer, Admin and Super Admin. */
export default function VolunServeButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  loading = false,
  style,
  accessibilityHint,
}: VolunServeButtonProps) {
  const blocked = disabled || loading;
  const isPrimary = variant === "primary" || variant === "danger";
  const foreground = isPrimary ? ui.color.white : variant === "ghost" ? ui.color.secondary : ui.color.primary;
  const background = variant === "primary" ? ui.color.primary :
    variant === "danger" ? ui.color.danger :
    variant === "secondary" ? ui.color.primarySoft : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: blocked, busy: loading }}
      disabled={blocked}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: background, borderColor: isPrimary ? background : ui.color.border },
        (pressed && !blocked) && styles.pressed,
        blocked && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={foreground} accessibilityLabel={label + " in progress"} />
      ) : (
        <View style={styles.inner}>
          {icon ? <Ionicons name={icon} size={18} color={foreground} /> : null}
          <Text style={[styles.label, { color: foreground }]}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: ui.minTap,
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderWidth: 1,
    borderRadius: ui.radius.control,
    justifyContent: "center",
    alignItems: "center",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  label: {
    fontSize: ui.type.label.fontSize,
    fontWeight: "700",
    lineHeight: ui.type.label.lineHeight,
    textAlign: "center",
  },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.82 },
});
