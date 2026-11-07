import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { volunserveUi as ui } from "../../constants/volunserveUi";

/** A signed-in profile read failure must not masquerade as a real logout. */
export default function AccountConnectionFallback({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <View style={styles.iconTile}>
          <Ionicons name="cloud-offline-outline" size={24} color={ui.color.warning} />
        </View>
        <Text style={styles.title}>Unable to load your account</Text>
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.note}>
          You are still signed in. VolunServe will not open protected account screens until your profile is checked.
        </Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Retry loading account"
          style={styles.button} onPress={onRetry}>
          <Ionicons name="refresh-outline" size={18} color={ui.color.white} />
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1, alignItems: "center", justifyContent: "center",
    backgroundColor: ui.color.background, padding: ui.spacing.base,
  },
  card: {
    width: "100%", maxWidth: 440, backgroundColor: ui.color.surface,
    borderWidth: 1, borderColor: ui.color.border,
    borderRadius: ui.radius.card, padding: ui.spacing.xl,
  },
  iconTile: {
    width: 48, height: 48, borderRadius: ui.radius.control, marginBottom: 14,
    alignItems: "center", justifyContent: "center", backgroundColor: ui.color.warningSoft,
  },
  title: {
    color: ui.color.text, fontSize: 22, lineHeight: 29, fontWeight: "700", marginBottom: 8,
  },
  message: { color: ui.color.muted, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  note: { color: ui.color.subtleText, fontSize: 12, lineHeight: 19, marginBottom: 20 },
  button: {
    minHeight: ui.minTouchHeight, backgroundColor: ui.color.primary,
    borderRadius: ui.radius.control, flexDirection: "row", gap: 9,
    alignItems: "center", justifyContent: "center",
  },
  buttonText: { color: ui.color.white, fontSize: 14, fontWeight: "700" },
});
