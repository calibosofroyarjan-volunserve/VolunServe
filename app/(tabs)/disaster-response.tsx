import Ionicons from "@expo/vector-icons/Ionicons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import DisasterResponse from "../../components/DisasterResponse";
import MapTracking from "../../components/tabs/MapTracking";

/**
 * One entry point for Resident emergencies. Keep the original map route for
 * legacy bookmarks and assigned Volunteer/LGU responders; do not duplicate it
 * in the sidebar. The map and reporting components preserve their existing
 * Firestore readers, case authorization and location-sharing controls.
 */
export default function EmergencyReportsHub() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ view?: string; caseId?: string }>();
  const view = params.view === "tracking" ? "tracking" : "report";
  const caseId = typeof params.caseId === "string" ? params.caseId : "";

  const openView = (next: "report" | "tracking") => {
    if (next === view) return;
    router.replace({
      pathname: "/(tabs)/disaster-response",
      params: next === "tracking"
        ? { view: "tracking", ...(caseId ? { caseId } : {}) }
        : { view: "report" },
    });
  };

  const compact = width < 770;

  return (
    <View style={styles.page}>
      <View style={[styles.serviceBar, compact && styles.compactServiceBar]}>
        <View style={styles.serviceLabel}>
          <View style={styles.serviceIcon}>
            <Ionicons name="shield-checkmark-outline" size={20} color="#087668" />
          </View>
          <View style={styles.serviceCopy}>
            <Text style={styles.serviceTitle}>Emergency Services</Text>
            <Text style={styles.serviceHint}>Report an incident or check its response.</Text>
          </View>
        </View>
        <View
          accessibilityLabel="Emergency service navigation"
          style={[styles.actionGroup, compact && styles.compactActionGroup]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report an emergency"
            accessibilityState={{ selected: view === "report" }}
            onPress={() => openView("report")}
            style={[styles.action, compact && styles.compactAction, view === "report" && styles.activeAction]}
          >
            <Ionicons name="document-text-outline" size={18}
              color={view === "report" ? "#FFFFFF" : "#34566A"} />
            <Text style={[styles.actionText, view === "report" && styles.activeActionText]}>
              Report Emergency
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Track an emergency report"
            accessibilityState={{ selected: view === "tracking" }}
            onPress={() => openView("tracking")}
            style={[styles.action, compact && styles.compactAction, view === "tracking" && styles.activeAction]}
          >
            <Ionicons name="map-outline" size={18}
              color={view === "tracking" ? "#FFFFFF" : "#34566A"} />
            <Text style={[styles.actionText, view === "tracking" && styles.activeActionText]}>
              Track Response
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.content}>
        {view === "tracking" ? <MapTracking /> : <DisasterResponse />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F3F8F8" },
  serviceBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 18, paddingVertical: 14, paddingHorizontal: 20,
    backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#DBE7E8",
  },
  compactServiceBar: { flexDirection: "column", alignItems: "stretch", paddingHorizontal: 12, gap: 12 },
  serviceLabel: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  serviceIcon: { backgroundColor: "#E9F7F2", borderRadius: 12, width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  serviceCopy: { flexShrink: 1, gap: 2 },
  serviceTitle: { color: "#13354B", fontSize: 17, lineHeight: 23, fontWeight: "800" },
  serviceHint: { color: "#506F7D", fontSize: 13, lineHeight: 19 },
  actionGroup: { flexDirection: "row", backgroundColor: "#EDF4F4", borderRadius: 12, padding: 4, gap: 4, flexShrink: 0 },
  compactActionGroup: { alignSelf: "stretch" },
  action: {
    minHeight: 48, paddingHorizontal: 16, borderRadius: 9, flexDirection: "row",
    alignItems: "center", justifyContent: "center", gap: 8,
  },
  compactAction: { flex: 1, paddingHorizontal: 8 },
  activeAction: { backgroundColor: "#087668" },
  actionText: { color: "#34566A", fontSize: 13, fontWeight: "700", lineHeight: 18 },
  activeActionText: { color: "#FFFFFF" },
  content: { flex: 1, minHeight: 0 },
});
