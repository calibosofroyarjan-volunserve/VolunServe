import {
  Redirect,
  Stack,
} from "expo-router";

import {
  ActivityIndicator,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

import {
  isApprovedProfile,
} from "../../lib/firebaseAuth";

import {
  useUserSession,
} from "../../lib/useUserSession";

const WEB_PORTAL_URL =
  "https://volunserve-3aa5b.web.app";

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
          color="#0F766E"
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

  const role =
    typeof profile?.role === "string"
      ? profile.role.toLowerCase()
      : "";

  /*
   * ADMIN ROUTES:
   * Only role === "admin" is allowed.
   *
   * Super Admin has a separate route group and
   * separate system-level dashboard.
   */
  if (role === "superadmin") {
    return (
      <Redirect href="/(superadmin)" />
    );
  }

  if (role !== "admin") {
    return (
      <Redirect href="/(tabs)" />
    );
  }

  /*
   * Operational Admin tools are web-only.
   */
  if (Platform.OS !== "web") {
    return (
      <View style={styles.blockedContainer}>
        <View style={styles.blockedCard}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>
              VS
            </Text>
          </View>

          <Text style={styles.blockedEyebrow}>
            VOLUNSERVE ADMINISTRATION
          </Text>

          <Text style={styles.blockedTitle}>
            Web Portal Required
          </Text>

          <Text style={styles.blockedDescription}>
            Operational Admin management
            is available through the
            VolunServe web portal.
          </Text>

          <Text style={styles.blockedDescription}>
            Please use a web browser on your
            phone, tablet, laptop, or desktop
            computer to continue.
          </Text>

          <TouchableOpacity
            style={styles.webButton}
            activeOpacity={0.85}
            onPress={() => {
              Linking.openURL(
                WEB_PORTAL_URL
              ).catch((error) => {
                console.log(
                  "open web portal error",
                  error
                );
              });
            }}
          >
            <Text style={styles.webButtonText}>
              Open Web Portal
            </Text>
          </TouchableOpacity>

          <Text style={styles.webAddress}>
            volunserve-3aa5b.web.app
          </Text>
        </View>
      </View>
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

const styles =
  StyleSheet.create({
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

    blockedContainer: {
      flex: 1,
      padding: 24,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#F1F5F9",
    },

    blockedCard: {
      width: "100%",
      maxWidth: 460,
      backgroundColor: "#FFFFFF",
      borderRadius: 22,
      padding: 28,
      alignItems: "center",
      borderWidth: 1,
      borderColor: "#E2E8F0",

      shadowColor: "#000000",
      shadowOffset: {
        width: 0,
        height: 5,
      },
      shadowOpacity: 0.08,
      shadowRadius: 16,
      elevation: 4,
    },

    iconCircle: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#CCFBF1",
      marginBottom: 18,
    },

    iconText: {
      color: "#0F766E",
      fontWeight: "900",
      fontSize: 22,
    },

    blockedEyebrow: {
      color: "#0F766E",
      fontWeight: "900",
      fontSize: 10,
      letterSpacing: 1.4,
      marginBottom: 8,
      textAlign: "center",
    },

    blockedTitle: {
      color: "#0F172A",
      fontSize: 25,
      fontWeight: "900",
      textAlign: "center",
    },

    blockedDescription: {
      marginTop: 10,
      color: "#64748B",
      fontSize: 14,
      lineHeight: 21,
      textAlign: "center",
      maxWidth: 360,
    },

    webButton: {
      width: "100%",
      minHeight: 48,
      marginTop: 22,
      borderRadius: 12,
      backgroundColor: "#0F766E",
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 18,
    },

    webButtonText: {
      color: "#FFFFFF",
      fontWeight: "900",
      fontSize: 14,
    },

    webAddress: {
      marginTop: 12,
      color: "#94A3B8",
      fontSize: 11,
      fontWeight: "600",
    },
  });
