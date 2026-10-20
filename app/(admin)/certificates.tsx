
import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useState } from "react";
import {
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

import AdminCertificatesScreen from "./admin-certificates";
import CommunityCertificatesAdminScreen from "./community-certificates";

type CertificateTab = "emergency" | "community";

const GREEN = "#078F82";
const MUTED = "#64798A";

export default function CertificatesHomeScreen() {
  const [tab, setTab] = useState<CertificateTab>("emergency");

  return (
    <View style={styles.screen}>
      <View style={styles.tabsBar}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "emergency" }}
          onPress={() => setTab("emergency")}
          style={[
            styles.tab,
            tab === "emergency" && styles.activeTab,
          ]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={17}
            color={tab === "emergency" ? "#FFFFFF" : MUTED}
          />
          <Text
            style={[
              styles.tabText,
              tab === "emergency" && styles.activeTabText,
            ]}
          >
            Emergency Service
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: tab === "community" }}
          onPress={() => setTab("community")}
          style={[
            styles.tab,
            tab === "community" && styles.activeTab,
          ]}
        >
          <Ionicons
            name="leaf-outline"
            size={17}
            color={tab === "community" ? "#FFFFFF" : MUTED}
          />
          <Text
            style={[
              styles.tabText,
              tab === "community" && styles.activeTabText,
            ]}
          >
            Community Events
          </Text>
        </Pressable>
      </View>

      <View style={styles.moduleContent}>
        {tab === "emergency" ? (
          <AdminCertificatesScreen />
        ) : (
          <CommunityCertificatesAdminScreen />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#F4F9F8",
  },
  tabsBar: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#DDEAE5",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 9,
    backgroundColor: "#F9FBFA",
    borderWidth: 1,
    borderColor: "#DCE8E4",
  },
  activeTab: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  tabText: {
    color: MUTED,
    fontSize: 11,
    fontWeight: "800",
  },
  activeTabText: {
    color: "#FFFFFF",
  },
  moduleContent: {
    flex: 1,
    minHeight: 0,
  },
});
