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
import { liveUi as ui } from "../../constants/volunserveLiveUi";

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
      onRequestClose={() => { if (request && cancelable) dismissAppDialog(request.id); }}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          accessibilityRole="button"
          accessibilityLabel="Dismiss dialog"
          disabled={!cancelable}
          onPress={() => { if (request && cancelable) dismissAppDialog(request.id); }}
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
    borderRadius: ui.radius.card, padding: 22, borderWidth: 1, borderColor: ui.color.border,
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
  title: { fontSize: ui.type.section.fontSize, lineHeight: ui.type.section.lineHeight, fontWeight: "700", color: ui.color.text },
  messageArea: { maxHeight: 260, marginTop: 8 },
  message: { fontSize: 14, lineHeight: 22, color: ui.color.secondary },
  actions: {
    flexDirection: "row", flexWrap: "wrap", gap: 9, marginTop: 22,
    justifyContent: "flex-end",
  },
  action: {
    minHeight: ui.minTap, minWidth: 90, paddingHorizontal: 17, borderRadius: ui.radius.control,
    backgroundColor: ui.color.primary, justifyContent: "center", alignItems: "center",
  },
  cancelAction: { backgroundColor: ui.color.primarySoft },
  dangerAction: { backgroundColor: ui.color.danger },
  actionLabel: { color: ui.color.white, fontSize: 13, fontWeight: "700" },
  cancelLabel: { color: ui.color.text },
});
