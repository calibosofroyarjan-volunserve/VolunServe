import {
    Redirect,
    Stack,
} from "expo-router";

import {
    ActivityIndicator,
    StyleSheet,
    Text,
    View,
} from "react-native";

import {
    isApprovedProfile,
} from "../../lib/firebaseAuth";

import {
    useUserSession,
} from "../../lib/useUserSession";

export default function SuperAdminLayout() {
  const {
    loading,
    user,
    profile,
  } = useUserSession();

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#7C3AED"
        />

        <Text style={styles.message}>
          Checking Super Admin access...
        </Text>
      </View>
    );
  }

  if (!user) {
    return (
      <Redirect href="/login" />
    );
  }

  if (!isApprovedProfile(profile)) {
    return (
      <Redirect href="/login" />
    );
  }

  const role =
    typeof profile?.role === "string"
      ? profile.role.toLowerCase()
      : "";

  /*
   * SUPER ADMIN ROUTES:
   * Only role === "superadmin" is allowed.
   */

  if (role !== "superadmin") {
    /*
     * Ordinary Admin should go back
     * to the Admin operational dashboard.
     */
    if (role === "admin") {
      return (
        <Redirect href="/(admin)" />
      );
    }

    /*
     * Resident / Volunteer / other users
     * return to their normal application.
     */
    return (
      <Redirect href="/(tabs)" />
    );
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
  },

  message: {
    marginTop: 10,
    color: "#64748B",
    fontWeight: "600",
  },
});