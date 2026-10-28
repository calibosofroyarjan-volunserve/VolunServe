import React, { useEffect, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  Modal, Pressable, ScrollView, StyleSheet, Text,
  TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import {
  AppDialogButton, AppDialogRequest,
  closeAppDialog, dismissAppDialog, subscribeAppDialog,
} from "../../lib/appDialog";

export default function AppDialogHost() {
  const [request, setRequest] = useState<AppDialogRequest | null>(null);
  const { width } = useWindowDimensions();
  useEffect(() => subscribeAppDialog(setRequest), []);
  const choose = (button: AppDialogButton) => {
    if (request) closeAppDialog(request.id, button);
  };
  const confirmOrDanger = request?.buttons.some(button => button.style === "destructive");
  const cancelable = request?.options?.cancelable !== false;
  return (
    <Modal
      visible={!!request}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => request && dismissAppDialog(request.id)}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          disabled={!cancelable}
          onPress={() => request && dismissAppDialog(request.id)}
        />
        {request && (
          <View
            accessibilityRole="alert"
            style={[styles.card, { width: Math.min(Math.max(width - 32, 240), 440) }]}
          >
            <View style={styles.header}>
              <View style={[styles.symbol, confirmOrDanger ? styles.symbolWarn : styles.symbolInfo]}>
                <Ionicons
                  name={confirmOrDanger ? "alert-circle-outline" : "information-circle-outline"}
                  color={confirmOrDanger ? "#9A3412" : "#087766"}
                  size={24}
                />
              </View>
              <View style={styles.headings}>
                <Text style={styles.title}>{request.title}</Text>
                {!!request.message && (
                  <ScrollView style={styles.messageArea} nestedScrollEnabled>
                    <Text style={styles.message}>{request.message}</Text>
                  </ScrollView>
                )}
              </View>
            </View>
            <View style={styles.actions}>
              {request.buttons.map((button, index) => {
                const cancel = button.style === "cancel";
                const destructive = button.style === "destructive";
                return (
                  <TouchableOpacity
                    key={`${request.id}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={button.text || "OK"}
                    onPress={() => choose(button)}
                    style={[styles.action, cancel && styles.cancelAction,
                      destructive && styles.dangerAction]}
                  >
                    <Text style={[styles.actionLabel, cancel && styles.cancelLabel]}>
                      {button.text || "OK"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1, backgroundColor: "rgba(7,25,29,0.58)",
    justifyContent: "center", alignItems: "center", padding: 16,
  },
  card: {
    maxHeight: "85%", backgroundColor: "#FFFFFF",
    borderRadius: 20, padding: 22, borderWidth: 1, borderColor: "#E1ECE8",
    shadowColor: "#031B15", shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.2, shadowRadius: 24, elevation: 10,
  },
  header: { flexDirection: "row", gap: 13, alignItems: "flex-start" },
  symbol: {
    height: 44, width: 44, borderRadius: 14,
    justifyContent: "center", alignItems: "center",
  },
  symbolInfo: { backgroundColor: "#E7F7F2" },
  symbolWarn: { backgroundColor: "#FFF1E8" },
  headings: { flex: 1, minWidth: 0 },
  title: { fontSize: 19, lineHeight: 25, fontWeight: "800", color: "#103A31" },
  messageArea: { maxHeight: 260, marginTop: 8 },
  message: { fontSize: 14, lineHeight: 22, color: "#48635E" },
  actions: {
    flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 22,
    justifyContent: "flex-end",
  },
  action: {
    minHeight: 46, minWidth: 90, paddingHorizontal: 17, borderRadius: 11,
    backgroundColor: "#087C66", justifyContent: "center", alignItems: "center",
  },
  cancelAction: { backgroundColor: "#ECF4F1" },
  dangerAction: { backgroundColor: "#B42318" },
  actionLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  cancelLabel: { color: "#385950" },
});
