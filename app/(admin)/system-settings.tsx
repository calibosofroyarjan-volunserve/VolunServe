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
    createAdminAccount,
} from "../../lib/adminAccounts";

import {
    createAdminLog,
} from "../../lib/adminLogger";

import { db } from "../../lib/firebase";

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

  const [adminName, setAdminName] =
    useState("");

  const [adminEmail, setAdminEmail] =
    useState("");

  const [
    adminPassword,
    setAdminPassword,
  ] = useState("");

  const [
    creatingAdmin,
    setCreatingAdmin,
  ] = useState(false);

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

  const saveSettings = async () => {
    if (
      !user ||
      !profile ||
      profile.role !== "superadmin"
    ) {
      return;
    }

    const hours = Number(retentionHours);

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
          cityName: cityName.trim(),

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

          updatedBy: user.uid,
        }
      );

      await createAdminLog({
        actionType:
          "system_settings_updated",

        targetType:
          "system_settings",

        targetId: "public",

        adminUid: user.uid,

        adminName:
          profile.fullName ||
          profile.email ||
          "Super Administrator",

        description:
          `Updated public contact settings and set ` +
          `live-location retention to ${hours} hour(s).`,
      });

      Alert.alert(
        "Settings saved",
        "Public contact information and retention controls are updated."
      );
    } catch (error: any) {
      console.log(
        "System settings error:",
        error
      );

      Alert.alert(
        "Unable to save settings",
        error?.message ||
          "Please try again."
      );
    } finally {
      setSaving(false);
    }
  };

  const createAdmin = async () => {
    const fullName = adminName
      .trim()
      .replace(/\s+/g, " ");

    const email = adminEmail
      .trim()
      .toLowerCase();

    if (fullName.length < 3) {
      Alert.alert(
        "Invalid name",
        "Enter the administrator's full name."
      );

      return;
    }

    if (
      !/^\S+@\S+\.\S+$/.test(email)
    ) {
      Alert.alert(
        "Invalid email",
        "Enter a valid administrator email."
      );

      return;
    }

    if (
      adminPassword.length < 10 ||
      !/[A-Z]/.test(adminPassword) ||
      !/[a-z]/.test(adminPassword) ||
      !/\d/.test(adminPassword) ||
      !/[^A-Za-z0-9]/.test(
        adminPassword
      )
    ) {
      Alert.alert(
        "Weak password",
        "Use at least 10 characters with uppercase, lowercase, number, and symbol."
      );

      return;
    }

    setCreatingAdmin(true);

    try {
      await createAdminAccount({
        fullName,
        email,
        password: adminPassword,
      });

      setAdminName("");
      setAdminEmail("");
      setAdminPassword("");

      Alert.alert(
        "Administrator created",
        `${email} can now sign in through the regular VolunServe login.`
      );
    } catch (error: any) {
      console.log(
        "Create admin error:",
        error
      );

      Alert.alert(
        "Unable to create administrator",
        error?.message ||
          "Please try again."
      );
    } finally {
      setCreatingAdmin(false);
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
          color="#0F766E"
        />
      </View>
    );
  }

  if (
    profile?.role !== "superadmin"
  ) {
    return (
      <View style={styles.center}>
        <Ionicons
          name="lock-closed-outline"
          size={36}
          color="#B91C1C"
        />

        <Text style={styles.denied}>
          Super Administrator access required
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
          name="settings"
          size={31}
          color="#FFFFFF"
        />

        <Text style={styles.title}>
          System Settings
        </Text>

        <Text style={styles.subtitle}>
          Manage public operational
          contacts and technical
          location-retention controls.
        </Text>
      </View>

      <View style={styles.notice}>
        <Text style={styles.noticeTitle}>
          Security boundary
        </Text>

        <Text style={styles.noticeText}>
          Account roles and Firestore
          permissions remain enforced in
          code and security rules. They
          cannot be weakened from this
          screen.
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Administrator Accounts
        </Text>

        <Text style={styles.helper}>
          Only the super administrator can
          create an admin. Admin and
          superadmin roles are never
          available in public registration.
        </Text>

        <Field
          label="Administrator Full Name"
          value={adminName}
          onChangeText={setAdminName}
          maxLength={120}
        />

        <Field
          label="Administrator Email"
          value={adminEmail}
          onChangeText={setAdminEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          maxLength={160}
        />

        <Field
          label="Temporary Password"
          value={adminPassword}
          onChangeText={
            setAdminPassword
          }
          secureTextEntry
          autoCapitalize="none"
          maxLength={128}
        />

        <Text style={styles.helper}>
          Minimum 10 characters with
          uppercase, lowercase, number,
          and symbol. Share this password
          only through a private channel.
        </Text>

        <TouchableOpacity
          disabled={creatingAdmin}
          style={[
            styles.button,
            creatingAdmin &&
              styles.disabled,
          ]}
          onPress={createAdmin}
        >
          {creatingAdmin ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text
              style={styles.buttonText}
            >
              Create Administrator
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>
          Public & Location Settings
        </Text>

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

        <Field
          label="Live Location Retention (Hours)"
          value={retentionHours}
          onChangeText={
            setRetentionHours
          }
          keyboardType="number-pad"
          maxLength={3}
        />

        <Text style={styles.helper}>
          When the scheduled server
          cleanup is deployed, it removes
          resident and volunteer
          live-location records older than
          this value. Choose the shortest
          period approved by the LGU
          privacy policy.
        </Text>

        <TouchableOpacity
          disabled={saving}
          style={[
            styles.button,
            saving && styles.disabled,
          ]}
          onPress={saveSettings}
        >
          {saving ? (
            <ActivityIndicator
              color="#FFFFFF"
            />
          ) : (
            <Text
              style={styles.buttonText}
            >
              Save System Settings
            </Text>
          )}
        </TouchableOpacity>
      </View>
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
          multiline ? "top" : "center"
        }
        style={[
          styles.input,
          multiline && styles.multiline,
        ]}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    backgroundColor: "#F8FAFC",
  },

  denied: {
    marginTop: 9,
    color: "#991B1B",
    fontWeight: "900",
    textAlign: "center",
  },

  container: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 60,
    backgroundColor: "#F1F5F9",
  },

  hero: {
    padding: 20,
    borderRadius: 20,
    backgroundColor: "#0F766E",
  },

  title: {
    marginTop: 8,
    color: "#FFFFFF",
    fontSize: 24,
    fontWeight: "900",
  },

  subtitle: {
    marginTop: 5,
    color: "#CCFBF1",
    lineHeight: 19,
  },

  notice: {
    marginTop: 15,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#6EE7B7",
  },

  noticeTitle: {
    color: "#065F46",
    fontWeight: "900",
  },

  noticeText: {
    marginTop: 4,
    color: "#065F46",
    lineHeight: 18,
  },

  card: {
    marginTop: 15,
    padding: 16,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
  },

  cardTitle: {
    color: "#0F172A",
    fontSize: 18,
    fontWeight: "900",
  },

  label: {
    marginTop: 12,
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
  },

  multiline: {
    minHeight: 100,
    paddingTop: 12,
  },

  helper: {
    marginTop: 7,
    color: "#64748B",
    fontSize: 12,
    lineHeight: 17,
  },

  button: {
    minHeight: 52,
    marginTop: 19,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0F766E",
  },

  buttonText: {
    color: "#FFFFFF",
    fontWeight: "900",
  },

  disabled: {
    opacity: 0.6,
  },
});