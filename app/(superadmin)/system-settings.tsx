import { AppAlert } from "../../lib/appDialog";
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
      AppAlert.alert(
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
      AppAlert.alert(
        "Invalid city name",
        "Enter between 3 and 120 characters."
      );

      return;
    }

    if (
      !/^[+()0-9\s-]{3,40}$/.test(emergencyHotline.trim())
    ) {
      AppAlert.alert(
        "Invalid hotline",
        "Enter a verified official phone number (digits, spaces, +, - or parentheses only)."
      );

      return;
    }

    if (
      supportEmail.trim() &&
      !/^\S+@\S+\.\S+$/.test(
        supportEmail.trim()
      )
    ) {
      AppAlert.alert(
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
      AppAlert.alert(
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
      AppAlert.alert(
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

      AppAlert.alert(
        "Settings Saved",
        "Public contact information and live-location retention settings were updated."
      );
    } catch (error: any) {
      console.log(
        "System settings error:",
        error
      );

      AppAlert.alert(
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
          color="#078F82"
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
          size={27}
          color="#23765F"
        />

        <Text style={styles.title}>
          System Settings
        </Text>

        <Text style={styles.subtitle}>
          Configure public contact details and the GPS record retention preference. These are technical settings—not LGU emergency dispatch or donation controls.
        </Text>
      </View>

      <View style={styles.notice}>
        <Ionicons
          name="shield-checkmark-outline"
          size={22}
          color="#08766C"
        />

        <View style={styles.noticeCopy}>
          <Text style={styles.noticeTitle}>
            Super Admin configuration
          </Text>

          <Text style={styles.noticeText}>
            Use this page in three steps: (1) verify the public contact details below, (2) select how long temporary GPS records should be retained, and (3) save. LGU account approval belongs in LGU Staff & Admin Accounts. Emergency response, assistance and donations belong to the LGU Admin portal.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Ionicons
              name="business-outline"
              size={21}
              color="#078F82"
            />
          </View>

          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>
              Public Service Information
            </Text>

            <Text style={styles.cardSubtitle}>
              Step 1 of 3 · Public-facing information. Only enter contacts confirmed by the LGU; do not use personal or sample numbers.
            </Text>
          </View>
        </View>

        <Field
          label="City / Service Name (shown publicly)"
          value={cityName}
          onChangeText={setCityName}
          maxLength={120}
        />

        <PresetField
          label="Official Emergency Hotline (public)"
          value={emergencyHotline}
          onChangeText={setEmergencyHotline}
          options={["911"]}
          placeholder="Enter verified official hotline number"
          help="Choose the national emergency hotline or Others to enter an independently verified official contact number. Do not enter generic instructions."
        />

        <Field
          label="Support Email (optional — public contact)"
          value={supportEmail}
          onChangeText={setSupportEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          maxLength={160}
        />

        <PresetField
          label="Public Service Notice"
          value={publicServiceNotice}
          onChangeText={setPublicServiceNotice}
          options={[
            "VolunServe requires internet connectivity and does not replace emergency hotlines.",
            "For immediate life-threatening emergencies, call 911. VolunServe reports require connectivity.",
          ]}
          multiline
          maxLength={500}
          help="Select an understandable notice or Others to write an authorized public notice."
        />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.cardIcon}>
            <Ionicons
              name="location-outline"
              size={21}
              color="#078F82"
            />
          </View>

          <View style={styles.cardHeaderText}>
            <Text style={styles.cardTitle}>
              Live Location Retention
            </Text>

            <Text style={styles.cardSubtitle}>
              Step 2 of 3 · This is the intended storage lifetime for temporary location records. It does not change GPS accuracy, update frequency, or activate tracking.
            </Text>
          </View>
        </View>

        <PresetField
          label="Retention Period (Hours)"
          value={retentionHours}
          onChangeText={setRetentionHours}
          options={["24", "48", "72"]}
          keyboardType="number-pad"
          maxLength={3}
          help="24 hours = 1 day, 48 hours = 2 days, 72 hours = 3 days. Choose a custom value only with an approved retention policy. Saving does not itself delete old records."
        />

        <Text style={styles.helper}>
          Important: the value is a retention preference, NOT a working automatic cleanup switch. Old GPS records require a separately verified cleanup process.
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
              Step 3 · Save System Settings
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

function PresetField({
  label, value, onChangeText, options, help, multiline, keyboardType, maxLength, placeholder,
}: {
  label: string; value: string; onChangeText: (next: string) => void; options: string[];
  help?: string; multiline?: boolean; keyboardType?: "number-pad"; maxLength?: number; placeholder?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const isOther = !options.includes(value);
  const [customMode, setCustomMode] = useState(isOther);
  useEffect(() => { setCustomMode(!options.includes(value)); }, [value]);
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={label + " options"}
        accessibilityState={{ expanded }} onPress={() => setExpanded(!expanded)}
        style={[styles.input, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
        <Text style={{ flex: 1, color: "#173D32" }} numberOfLines={2}>
          {customMode ? (value ? `Custom: ${value}` : "Custom value — enter below") : (value || "Select an option")}
        </Text>
        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color="#23765F"/>
      </TouchableOpacity>
      {expanded && <View style={{ borderWidth: 1, borderColor: "#DCE9E3", borderRadius: 11, marginTop: 4, overflow: "hidden" }}>
        {[...options, "Others — specify"].map((option) =>
          <TouchableOpacity key={option} accessibilityRole="button" onPress={() => {
            const other = option === "Others — specify";
            setCustomMode(other); setExpanded(false);
            if (!other) onChangeText(option);
            else if (options.includes(value)) onChangeText("");
          }} style={{ padding: 13, backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderColor: "#EDF3EF" }}>
            <Text style={{ color: "#173D32" }}>{option}</Text>
          </TouchableOpacity>)}
      </View>}
      {customMode && <TextInput value={value} onChangeText={onChangeText}
        placeholder={placeholder || "Specify your value"}
        accessibilityLabel={label + " custom value"}
        keyboardType={keyboardType}
        multiline={multiline} maxLength={maxLength || 160}
        style={[styles.input, { marginTop: 8 }, multiline && styles.multiline]} />}
      {!!help && <Text style={styles.helper}>{help}</Text>}
    </View>
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
      backgroundColor: "#F6F8F7",
    },

    hero: {
      padding: 21,
      borderRadius: 10,
      backgroundColor: "#078F82",
    },

    title: {
      marginTop: 8,
      color: "#FFFFFF",
      fontSize: 26,
      fontWeight: "700",
    },

    subtitle: {
      marginTop: 5,
      maxWidth: 700,
      color: "#E6F7F1",
      lineHeight: 20,
    },

    notice: {
      marginTop: 15,
      padding: 14,
      borderRadius: 8,
      backgroundColor: "#F3FAF8",
      borderWidth: 1,
      borderColor: "#BDE5D9",
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 10,
    },

    noticeCopy: {
      flex: 1,
    },

    noticeTitle: {
      color: "#08766C",
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
      backgroundColor: "#E6F7F1",
    },

    cardHeaderText: {
      flex: 1,
    },

    cardTitle: {
      color: "#173D32",
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
      color: "#173D32",
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
      backgroundColor: "#078F82",
    },

    buttonText: {
      color: "#FFFFFF",
      fontWeight: "900",
    },

    disabled: {
      opacity: 0.6,
    },
  });
