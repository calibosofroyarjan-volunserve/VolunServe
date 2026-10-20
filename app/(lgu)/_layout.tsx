import { Redirect, Stack } from "expo-router";
import React from "react";
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    homeRouteForProfile,
    isApprovedProfile,
    isLguPersonnelProfile,
} from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

export default function LguLayout() {
  const { loading, user, profile } = useUserSession();

  if (loading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator size="large" color="#078C83" />
        <Text style={styles.loadingText}>
          Checking LGU Personnel access...
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

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="index" />
    </Stack>
  );
}

const styles = StyleSheet.create({
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
