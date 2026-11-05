import { Redirect, useRouter } from "expo-router";
import React from "react";
import {
    ActivityIndicator,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    homeRouteForProfile,
    isApprovedProfile,
    isLguPersonnelProfile,
    logoutUser,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

export default function LguLayout() {
  const { loading, user, profile } = useUserSession();
  const router = useRouter();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#078C83" />
        <Text style={styles.loadingText}>
          Checking account access...
        </Text>
      </View>
    );
  }

  if (!user || !profile || !isApprovedProfile(profile)) {
    return <Redirect href="/login" />;
  }

  if (profile.role !== "lgu_personnel") {
    return (
      <Redirect
        href={homeRouteForProfile(profile) as any}
      />
    );
  }

  if (!isLguPersonnelProfile(profile)) {
    return <Redirect href="/login" />;
  }

  // Deprecated: existing personnel accounts remain stored for history,
  // but no dedicated LGU dispatch/Responder portal is exposed in VolunServe.
  // This gate also blocks legacy /response-map deep links in the route group.
  return (
    <View style={styles.retiredScreen}>
      <Text style={styles.retiredTitle}>Volunteer-based emergency coordination</Text>
      <Text style={styles.retiredDescription}>
        This former responder workspace is no longer part of the active
        VolunServe workflow. Emergency reports are coordinated by Admin
        and assigned to approved Volunteers.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={async () => {
          await logoutUser();
          router.replace("/login");
        }}
        style={styles.signOutButton}
      >
        <Text style={styles.signOutText}>Sign Out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  retiredScreen: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, backgroundColor: "#F4F9F6" },
  retiredTitle: { fontSize: 23, fontWeight: "800", color: "#124D39", textAlign: "center", marginBottom: 12 },
  retiredDescription: { maxWidth: 520, color: "#526B61", textAlign: "center", lineHeight: 23, fontSize: 14, marginBottom: 22 },
  signOutButton: { backgroundColor: "#087A62", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 26 },
  signOutText: { color: "#FFFFFF", fontWeight: "800", fontSize: 14 },
  loadingScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
});
