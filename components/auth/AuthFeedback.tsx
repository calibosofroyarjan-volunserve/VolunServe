import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";

type AuthFeedbackProps = {
  message: string;
  type?: "error" | "success";
  onDismiss?: () => void;
};

/** Non-blocking, accessible feedback for Resident and LGU sign-in.
 * Never use browser alert/confirm for routine authentication errors.
 */
export default function AuthFeedback({
  message,
  type = "error",
  onDismiss,
}: AuthFeedbackProps) {
  if (!message) return null;
  const success = type === "success";
  return (
    <View
      accessibilityRole="alert"
      style={[styles.box, success ? styles.successBox : styles.errorBox]}
    >
      <Ionicons
        name={success ? "checkmark-circle-outline" : "alert-circle-outline"}
        size={20}
        color={success ? "#087553" : "#B42318"}
        style={styles.icon}
      />
      <View style={styles.copy}>
        <Text style={[styles.title, success ? styles.successTitle : styles.errorTitle]}>
          {success ? "Request received" : "Unable to continue"}
        </Text>
        <Text style={[styles.message, success ? styles.successText : styles.errorText]}>
          {message}
        </Text>
      </View>
      {onDismiss ? (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Dismiss sign-in message"
          onPress={onDismiss}
          style={styles.close}
        >
          <Ionicons name="close" size={19} color={success ? "#087553" : "#9E3326"} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    marginTop: 8,
    marginBottom: 6,
  },
  errorBox: { backgroundColor: "#FFF4F1", borderColor: "#F4C9C1" },
  successBox: { backgroundColor: "#EDF9F1", borderColor: "#B8DFC8" },
  icon: { marginTop: 2 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 13, lineHeight: 19, fontWeight: "800" },
  errorTitle: { color: "#922C22" },
  successTitle: { color: "#086449" },
  message: { fontSize: 13, lineHeight: 19 },
  errorText: { color: "#8C342D" },
  successText: { color: "#17654A" },
  close: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginTop: -4,
    marginRight: -5,
  },
});
