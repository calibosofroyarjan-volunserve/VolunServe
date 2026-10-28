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
 * Emergency Reports owns the case-specific response map. Keep the existing
 * /map-tracking route available for old deep links and Volunteer Tasks, but
 * don't expose a duplicate top-level Resident/Volunteer sidebar item.
 *
 * We reuse the existing map and report components without changing their
 * Firestore subscriptions, emergency dispatch, permissions or GPS logic.
 */
export default function EmergencyReportsHub() {
  const router = useRouter();
  const params = useLocalSearchParams<{ view?: string; caseId?: string }>();
  const { width } = useWindowDimensions();
  const view = params.view === "tracking" ? "tracking" : "report";
  const caseId = typeof params.caseId === "string" ? params.caseId : "";

  const openView = (next: "report" | "tracking") => {
    router.replace({
      pathname: "/(tabs)/disaster-response",
      params: next === "tracking"
        ? { view: "tracking", ...(caseId ? { caseId } : {}) }
        : { view: "report" },
    });
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.navigation, width < 520 && styles.navigationMobile]}>
        <View style={styles.intro}>
          <Text style={styles.eyebrow}>VOLUNSERVE · EMERGENCY SERVICES</Text>
          <Text style={styles.heading}>Emergency Reports</Text>
          <Text style={styles.description}>
            Submit a report or follow the official response to your existing case.
          </Text>
        </View>
        <View style={[styles.tabs, width < 520 && styles.tabsMobile]}
          accessibilityLabel="Emergency reports and tracking views">
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: view === "report" }}
            accessibilityLabel="Open emergency reporting form"
            onPress={() => openView("report")}
            style={[styles.tab, view === "report" && styles.selectedTab]}>
            <Ionicons name="alert-circle-outline" size={17}
              color={view === "report" ? "#FFFFFF" : "#426478"} />
            <Text style={[styles.tabLabel, view === "report" && styles.selectedTabLabel]}>
              Report Emergency
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: view === "tracking" }}
            accessibilityLabel="Open emergency response map"
            onPress={() => openView("tracking")}
            style={[styles.tab, view === "tracking" && styles.selectedTab]}>
            <Ionicons name="map-outline" size={17}
              color={view === "tracking" ? "#FFFFFF" : "#426478"} />
            <Text style={[styles.tabLabel, view === "tracking" && styles.selectedTabLabel]}>
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
  screen: { flex: 1, backgroundColor: "#F1F7F8" },
  navigation: {
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: "#DCE9E8",
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 18,
  },
  navigationMobile: { flexDirection: "column", alignItems: "stretch", paddingHorizontal: 12, gap: 12 },
  intro: { flexShrink: 1, gap: 3 },
  eyebrow: { color: "#08786C", fontWeight: "800", fontSize: 10, letterSpacing: 1.1 },
  heading: { color: "#102F4F", fontWeight: "800", fontSize: 21 },
  description: { color: "#547081", fontSize: 12, lineHeight: 17 },
  tabs: {
    flexDirection: "row", borderRadius: 12, padding: 4,
    backgroundColor: "#EFF6F5", gap: 4, flexShrink: 0,
  },
  tabsMobile: { alignSelf: "stretch" },
  tab: {
    minHeight: 42, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 7, paddingHorizontal: 12, borderRadius: 9,
  },
  selectedTab: { backgroundColor: "#087E72" },
  tabLabel: { color: "#426478", fontSize: 12, fontWeight: "700" },
  selectedTabLabel: { color: "#FFFFFF" },
  content: { flex: 1, minHeight: 0 },
});
