import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { liveUi as designUi } from "../../constants/volunserveLiveUi";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import DisasterResponse from "../../components/DisasterResponse";
import MapTracking from "../../components/tabs/MapTracking";

/**
 * One Emergency Reports module owns both report submission and live response
 * tracking. Tracking remains case-aware; the legacy /map-tracking deep link
 * stays available to authorized responders but is not a sidebar destination.
 */
export default function EmergencyReportsScreen() {
  const params = useLocalSearchParams<{ view?: string; caseId?: string }>();
  const router = useRouter();
  const active = params.view === "tracking" || !!params.caseId;
  const changeView = (view: "report" | "tracking") => {
    router.setParams({ view, caseId: undefined });
  };
  return (
    <View style={styles.page}>
      <View style={styles.switcher} accessibilityLabel="Emergency Reports sections">
        <View style={styles.heading}>
          <Text style={styles.eyebrow}>EMERGENCY REPORTS</Text>
          <Text style={styles.subtitle}>Incident reporting and live LGU response in one place</Text>
        </View>
        <View style={styles.switchTabs}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Report an emergency"
            accessibilityState={{ selected: !active }}
            onPress={() => changeView("report")}
            style={[styles.tab, !active && styles.activeTab]}
          >
            <Ionicons name="alert-circle-outline" size={16} color={!active ? "#FFFFFF" : "#246958"} />
            <Text style={[styles.tabLabel, !active && styles.activeLabel]}>Report Emergency</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Live response map inside Emergency Reports"
            accessibilityState={{ selected: active }}
            onPress={() => changeView("tracking")}
            style={[styles.tab, active && styles.activeTab]}
          >
            <Ionicons name="map-outline" size={16} color={active ? "#FFFFFF" : "#246958"} />
            <Text style={[styles.tabLabel, active && styles.activeLabel]}>Live Response Map</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.content}>
        {active ? <MapTracking /> : <DisasterResponse />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: 0, backgroundColor: "#F4F9F6" },
  switcher: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "space-between",
    gap: 12, paddingHorizontal: 18, paddingVertical: 12, backgroundColor: "#FFFFFF",
    borderBottomWidth: 1, borderBottomColor: "#DBE8E0" },
  heading: { gap: 3, flexGrow: 1 },
  eyebrow: { fontSize: vsType.size.caption, fontFamily: vsType.family, fontWeight: "800", letterSpacing: 1.1, color: "#075F4D" },
  subtitle: { fontSize: designUi.type.body.fontSize, color: "#577B69", lineHeight: designUi.type.body.lineHeight, fontWeight: designUi.type.body.fontWeight,},
  switchTabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: { flexDirection: "row", alignItems: "center", gap: 7, minHeight: 38, paddingHorizontal: 13,
    backgroundColor: "#EAF5EE", borderRadius: 9, borderWidth: 1, borderColor: "#D6E9DF" },
  activeTab: { backgroundColor: "#087A62", borderColor: "#087A62" },
  tabLabel: { fontSize: designUi.type.label.fontSize, fontWeight: designUi.type.label.fontWeight, color: "#246958", lineHeight: designUi.type.label.lineHeight,},
  activeLabel: { color: "#FFFFFF", fontSize: designUi.type.label.fontSize, lineHeight: designUi.type.label.lineHeight, fontWeight: designUi.type.label.fontWeight,},
  content: { flex: 1, minHeight: 0 },
});
