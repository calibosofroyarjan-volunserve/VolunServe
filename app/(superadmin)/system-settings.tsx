import { Ionicons } from "@expo/vector-icons";

import {
  doc,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

import React, {
  useEffect,
  useState,
} from "react";

import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import {
  createAdminLog,
} from "../../lib/adminLogger";

import { db } from "../../lib/firebase";

import {
  isApprovedProfile,
} from "../../lib/firebaseAuth";

import {
  usePublicSettings,
} from "../../lib/usePublicSettings";

import {
  useUserSession,
} from "../../lib/useUserSession";

export default function SystemSettings() {
  const {
    loading: sessionLoading,
    user,
    profile,
  } = useUserSession();

  const {
    settings,
    loading: settingsLoading,
  } = usePublicSettings();

  const [cityName, setCityName] =
    useState("");

  const [
    emergencyHotline,
    setEmergencyHotline,
  ] = useState("");

  const [
    supportEmail,
    setSupportEmail,
  ] = useState("");

  const [
    publicServiceNotice,
    setPublicServiceNotice,
  ] = useState("");

  const [
    retentionHours,
    setRetentionHours,
  ] = useState("24");

  const [saving, setSaving] =
    useState(false);

  useEffect(() => {
    setCityName(settings.cityName);

    setEmergencyHotline(
      settings.emergencyHotline
    );

    setSupportEmail(
      settings.supportEmail
    );

    setPublicServiceNotice(
      settings.publicServiceNotice
    );

    setRetentionHours(
      String(
        settings.liveLocationRetentionHours
      )
    );
  }, [settings]);

  const role =
    typeof profile?.role === "string"
      ? profile.role.toLowerCase()
      : "";

  const isSuperAdmin =
    !!user &&
    isApprovedProfile(profile) &&
    role === "superadmin";

  const saveSettings = async () => {
    if (!isSuperAdmin || !user || !profile) {
      Alert.alert(
        "Access Denied",
        "Only the active Super Admin can update system settings."
      );

      return;
    }

    const hours =
      Number(retentionHours);

    if (
      cityName.trim().length < 3 ||
      cityName.trim().length > 120
    ) {
      Alert.alert(
        "Invalid city name",
        "Enter between 3 and 120 characters."
      );

      return;
    }

    if (
      emergencyHotline.trim().length < 3 ||
      emergencyHotline.trim().length > 160
    ) {
      Alert.alert(
        "Invalid hotline",
        "Enter an official hotline or contact instruction."
      );

      return;
    }

    if (
      supportEmail.trim() &&
      !/^\S+@\S+\.\S+$/.test(
        supportEmail.trim()
      )
    ) {
      Alert.alert(
        "Invalid email",
        "Enter a valid support email or leave it blank."
      );

      return;
    }

    if (
      publicServiceNotice.trim().length <
        10 ||
      publicServiceNotice.trim().length >
        500
    ) {
      Alert.alert(
        "Invalid public notice",
        "Enter between 10 and 500 characters."
      );

      return;
    }

    if (
      !Number.isInteger(hours) ||
      hours < 1 ||
      hours > 720
    ) {
      Alert.alert(
        "Invalid retention",
        "Choose a whole number from 1 to 720 hours."
      );

      return;
    }

    setSaving(true);

    try {
      await setDoc(
        doc(
          db,
          "systemSettings",
          "public"
        ),
        {
          cityName:
            cityName.trim(),

          emergencyHotline:
            emergencyHotline.trim(),

          supportEmail:
            supportEmail
              .trim()
              .toLowerCase(),

          publicServiceNotice:
            publicServiceNotice.trim(),

          liveLocationRetentionHours:
            hours,

          updatedAt:
            serverTimestamp(),

          updatedBy:
            user.uid,
        }
      );

      await createAdminLog({
        actionType:
          "system_settings_updated",

        targetType:
          "system_settings",

        targetId:
          "public",

        adminUid:
          user.uid,

        adminName:
          profile.fullName ||
          profile.email ||
          "Super Administrator",

        description:
          `Updated public contact settings and set ` +
          `live-location retention to ${hours} hour(s).`,
      });

      Alert.alert(
        "Settings Saved",
        "Public contact information and live-location retention settings were updated."
      );
    } catch (error: any) {
      console.log(
        "System settings error:",
        error
      );

      Alert.alert(
        "Unable to Save Settings",
        error?.message ||
          "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  if (
    sessionLoading ||
    settingsLoading
  ) {
    return (
      <View style={styles.center}>
        <ActivityIndicator
          size="large"
          color="#6D28D9"
        />

        <Text style={styles.loadingText}>
          Loading system settings...
        </Text>
      </View>
    );
  }

  if (!isSuperAdmin) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={40}
          color="#B91C1C"
        />

        <Text style={styles.denied}>
          Super Admin access required
        </Text>

        <Text style={styles.deniedText}>
          System configuration is available only to the active Super Admin account.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={
        styles.container
      }
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.hero}>
        <Ionicons
          name="settings-outline"
          size={31}
          color="#FFFFFF"
        />

        <Text style={styles.title}>
          System Settings
        </Text>

        <Text style={styles.subtitle}>
          Manage system-wide public contact information and technical live-location retention controls.
        </Text>
      </View>

      <View style={styles.notice}>
        <Ionicons
          name="shield-checkmark-outline"
          size={22}
          color="#5B21B6"
        />

        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>
            Super Admin configuration
          </Text>

          <Text style={styles.noticeText}>
            This page is intentionally limited to global configuration. Admin account management remains in the separate Admin Accounts module, and operational Admin tools remain in the Admin portal.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Ionicons
              name="business-outline"
              size={21}
              color="#6D28D9"
            />
          </View>

          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>
              Public Service Information
            </Text>

            <Text style={styles.cardSubtitle}>
              These values may be displayed to VolunServe users where public service and emergency contact information is needed.
            </Text>
          </View>
        </View>

        <Field
          label="City / Service Name"
          value={cityName}
          onChangeText={setCityName}
          maxLength={120}
        />

        <Field
          label="Official Emergency Hotline or Contact Instruction"
          value={emergencyHotline}
          onChangeText={
            setEmergencyHotline
          }
          maxLength={160}
        />

        <Field
          label="Support Email (Optional)"
          value={supportEmail}
          onChangeText={setSupportEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          maxLength={160}
        />

        <Field
          label="Public Service Notice"
          value={publicServiceNotice}
          onChangeText={
            setPublicServiceNotice
          }
          maxLength={500}
          multiline
        />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Ionicons
              name="location-outline"
              size={21}
              color="#6D28D9"
            />
          </View>

          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>
              Live Location Retention
            </Text>

            <Text style={styles.cardSubtitle}>
              Configure the intended retention window for temporary resident and volunteer live-location records.
            </Text>
          </View>
        </View>

        <Field
          label="Retention Period (Hours)"
          value={retentionHours}
          onChangeText={
            setRetentionHours
          }
          keyboardType="number-pad"
          maxLength={3}
        />

        <Text style={styles.helper}>
          Valid range: 1–720 hours. This setting records the approved retention period. Automatic deletion still depends on the cleanup mechanism implemented by the system.
        </Text>
      </View>

      <View style={styles.securityCard}>
        <Ionicons
          name="lock-closed-outline"
          size={21}
          color="#0369A1"
        />

        <Text style={styles.securityText}>
          Role permissions and Firestore security rules cannot be weakened from this screen. Admin Accounts, audit logs, and operational actions remain separate modules.
        </Text>
      </View>

      <TouchableOpacity
        disabled={saving}
        style={[
          styles.button,
          saving &&
            styles.disabled,
        ]}
        onPress={saveSettings}
      >
        {saving ? (
          <ActivityIndicator
            color="#FFFFFF"
          />
        ) : (
          <>
            <Ionicons
              name="save-outline"
              size={18}
              color="#FFFFFF"
            />

            <Text style={styles.buttonText}>
              Save System Settings
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label,
  multiline,
  ...props
}: any) {
  return (
    <>
      <Text style={styles.label}>
        {label}
      </Text>

      <TextInput
        {...props}
        multiline={multiline}
        textAlignVertical={
          multiline
            ? "top"
            : "center"
        }
        style={[
          styles.input,
          multiline &&
            styles.multiline,
        ]}
      />
    </>
  );
}

const styles =
  StyleSheet.create({
    center: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      backgroundColor: "#F8FAFC",
    },

    loadingText: {
      marginTop: 10,
      color: "#64748B",
      fontWeight: "600",
    },

    denied: {
      marginTop: 10,
      color: "#991B1B",
      fontSize: 19,
      fontWeight: "900",
      textAlign: "center",
    },

    deniedText: {
      marginTop: 6,
      maxWidth: 460,
      color: "#64748B",
      lineHeight: 20,
      textAlign: "center",
    },

    container: {
      width: "100%",
      maxWidth: 1000,
      alignSelf: "center",
      flexGrow: 1,
      padding: 24,
      paddingBottom: 60,
      backgroundColor: "#F1F5F9",
    },

    hero: {
      padding: 21,
      borderRadius: 20,
      backgroundColor: "#6D28D9",
    },

    title: {
      marginTop: 8,
      color: "#FFFFFF",
      fontSize: 26,
      fontWeight: "900",
    },

    subtitle: {
      marginTop: 5,
      maxWidth: 700,
      color: "#EDE9FE",
      lineHeight: 20,
    },

    notice: {
      marginTop: 15,
      padding: 14,
      borderRadius: 14,
      backgroundColor: "#F5F3FF",
      borderWidth: 1,
      borderColor: "#DDD6FE",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },

    noticeCopy: {
      flex: 1,
    },

    noticeTitle: {
      color: "#5B21B6",
      fontWeight: "900",
    },

    noticeText: {
      marginTop: 4,
      color: "#64748B",
      lineHeight: 18,
      fontSize: 12.5,
    },

    card: {
      marginTop: 15,
      padding: 17,
      borderRadius: 17,
      backgroundColor: "#FFFFFF",
      borderWidth: 1,
      borderColor: "#E2E8F0",
    },

    cardHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 11,
      marginBottom: 2,
    },

    cardIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "#EDE9FE",
    },

    cardHeaderText: {
      flex: 1,
    },

    cardTitle: {
      color: "#0F172A",
      fontSize: 18,
      fontWeight: "900",
    },

    cardSubtitle: {
      marginTop: 3,
      color: "#64748B",
      lineHeight: 18,
      fontSize: 12.5,
    },

    label: {
      marginTop: 13,
      marginBottom: 6,
      color: "#334155",
      fontSize: 12,
      fontWeight: "900",
    },

    input: {
      minHeight: 47,
      borderWidth: 1,
      borderColor: "#CBD5E1",
      borderRadius: 11,
      paddingHorizontal: 12,
      color: "#0F172A",
      backgroundColor: "#F8FAFC",
      outlineStyle: "none",
    } as any,

    multiline: {
      minHeight: 110,
      paddingTop: 12,
    },

    helper: {
      marginTop: 8,
      color: "#64748B",
      fontSize: 12,
      lineHeight: 18,
    },

    securityCard: {
      marginTop: 15,
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 9,
      padding: 13,
      borderRadius: 12,
      backgroundColor: "#E0F2FE",
    },

    securityText: {
      flex: 1,
      color: "#075985",
      fontSize: 12,
      lineHeight: 18,
    },

    button: {
      minHeight: 52,
      marginTop: 18,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      backgroundColor: "#6D28D9",
    },

    buttonText: {
      color: "#FFFFFF",
      fontWeight: "900",
    },

    disabled: {
      opacity: 0.6,
    },
  });
