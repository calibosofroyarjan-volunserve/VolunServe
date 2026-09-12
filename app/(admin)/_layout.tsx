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
    isAdminProfile,
    isApprovedProfile,
} from "../../lib/firebaseAuth";

import {
    useUserSession,
} from "../../lib/useUserSession";

export default function AdminLayout() {
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
          Checking administrator access...
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

  if (!isAdminProfile(profile)) {
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