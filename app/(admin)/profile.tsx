import Ionicons from "@expo/vector-icons/Ionicons";
import { Href, Redirect, useRouter } from "expo-router";
import { doc, updateDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, ScrollView, StyleSheet, Text,
  TextInput, TouchableOpacity, View, useWindowDimensions,
} from "react-native";
import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

const initialsFor = (value: string) =>
  value.trim().split(/\s+/).slice(0, 2)
    .map(part => part.charAt(0).toUpperCase()).join("") || "AD";
const present = (value: unknown) => typeof value === "string" && value.trim() ? value.trim() : "Not provided";

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>{value}</Text>
    </View>
  );
}

export default function AdminProfile() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const compact = width < 860;
  const { loading, user, profile } = useUserSession();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!editing) {
      setName(profile?.fullName || "");
      setPhone(profile?.phoneNumber || "");
    }
  }, [profile?.fullName, profile?.phoneNumber, editing]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#23765F" />
        <Text style={styles.muted}>Loading Admin profile…</Text>
      </View>
    );
  }
  if (!user || !profile) return <Redirect href={"/admin-login" as Href} />;
  if (profile.role === "superadmin") return <Redirect href={"/(superadmin)" as Href} />;
  if (profile.role !== "admin" || !isApprovedProfile(profile))
    return <Redirect href={"/(tabs)" as Href} />;

  const beginEdit = () => {
    setName(profile.fullName || "");
    setPhone(profile.phoneNumber || "");
    setError("");
    setMessage("");
    setEditing(true);
  };
  const cancelEdit = () => {
    setEditing(false);
    setError("");
  };
  const saveContact = async () => {
    const nextName = name.trim();
    const nextPhone = phone.trim();
    if (nextName.length < 2 || nextName.length > 120) {
      setError("Enter a name between 2 and 120 characters.");
      return;
    }
    if (nextPhone.length > 30) {
      setError("Contact number must be 30 characters or fewer.");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      // Only self-editable contact fields; staff roles and approvals are not editable here.
      await updateDoc(doc(db, "users", user.uid), {
        fullName: nextName, phoneNumber: nextPhone,
      });
      setEditing(false);
      setMessage("Contact information updated.");
    } catch (cause: any) {
      setError(cause?.message || "Unable to save profile details. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={[styles.page, compact && styles.pageCompact]}
      showsVerticalScrollIndicator keyboardShouldPersistTaps="handled"
      accessibilityLabel="LGU Admin profile">
      <View style={styles.pageHeader}>
        <View>
          <Text style={styles.eyebrow}>LGU ADMINISTRATION</Text>
          <Text style={styles.pageTitle}>My profile</Text>
          <Text style={styles.subtitle}>Your account information and access details.</Text>
        </View>
        <TouchableOpacity accessibilityRole="button" style={styles.backButton}
          onPress={() => router.push("/(admin)/command-center" as Href)}>
          <Ionicons name="arrow-back-outline" size={17} color="#23765F" />
          <Text style={styles.backText}>Back to overview</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsFor(profile.fullName || user.email || "")}</Text>
        </View>
        <View style={styles.identityCopy}>
          <Text style={styles.personName}>{present(profile.fullName)}</Text>
          <Text style={styles.personEmail} selectable>{present(user.email || profile.email)}</Text>
          <View style={styles.roleLine}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#22735D" />
            <Text style={styles.roleText}>LGU Admin</Text>
            <Text style={styles.separator}>·</Text>
            <Text style={styles.roleText}>
              {profile.adminStatus === "suspended" || profile.status === "suspended" ? "Access suspended" :
                isApprovedProfile(profile) ? "Approved account" : "Account pending"}
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.twoColumns, compact && styles.twoColumnsCompact]}>
        <View style={styles.primaryColumn}>
          <View style={styles.sectionTitleRow}>
            <View>
              <Text style={styles.sectionTitle}>Contact information</Text>
              <Text style={styles.sectionDescription}>Only your name and contact number can be edited here.</Text>
            </View>
            {!editing && (
              <TouchableOpacity accessibilityRole="button" style={styles.editButton} onPress={beginEdit}>
                <Ionicons name="create-outline" size={17} color="#23765F" />
                <Text style={styles.editText}>Edit</Text>
              </TouchableOpacity>
            )}
          </View>
          {editing ? (
            <View style={styles.form}>
              <Text style={styles.fieldLabel}>Full name</Text>
              <TextInput accessibilityLabel="Full name" style={styles.input}
                value={name} onChangeText={setName} maxLength={120}
                placeholder="Full name" placeholderTextColor="#899A90" editable={!saving} />
              <Text style={styles.fieldLabel}>Contact number</Text>
              <TextInput accessibilityLabel="Contact number" style={styles.input}
                value={phone} onChangeText={setPhone} maxLength={30}
                placeholder="Contact number" placeholderTextColor="#899A90"
                keyboardType="phone-pad" editable={!saving} />
              <View style={styles.buttonRow}>
                <TouchableOpacity accessibilityRole="button" style={styles.saveButton}
                  disabled={saving} onPress={() => void saveContact()}>
                  {saving ? <ActivityIndicator color="#FFFFFF" size="small" /> :
                    <Text style={styles.saveText}>Save changes</Text>}
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" style={styles.cancelButton}
                  disabled={saving} onPress={cancelEdit}>
                  <Text style={styles.cancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View>
              <Detail label="Full name" value={present(profile.fullName)} />
              <Detail label="Email address" value={present(user.email || profile.email)} />
              <Detail label="Contact number" value={present(profile.phoneNumber)} />
            </View>
          )}
          {!!message && <Text style={styles.success}>{message}</Text>}
          {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        </View>

        <View style={styles.secondaryColumn}>
          <Text style={styles.sectionTitle}>LGU access</Text>
          <Text style={styles.sectionDescription}>Access and department details are managed by authorized administrators.</Text>
          <Detail label="Account role" value="LGU Admin" />
          <Detail label="Department / Office" value={present(profile.department)} />
          <Detail label="Official position" value={present(profile.position)} />
          <Detail label="Barangay" value={present(profile.barangay)} />
          <View style={styles.infoNote}>
            <Ionicons name="information-circle-outline" size={17} color="#537C6C" />
            <Text style={styles.infoText}>
              Role permissions and LGU credential approvals cannot be changed through this profile.
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: "#F6F8F7" },
  page: { width: "100%", maxWidth: 1150, alignSelf: "center", paddingHorizontal: 32, paddingTop: 31, paddingBottom: 68 },
  pageCompact: { paddingHorizontal: 18, paddingTop: 24 },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#F6F8F7" },
  muted: { color: "#708278", fontSize: 13 },
  pageHeader: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 14, marginBottom: 26 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.1, color: "#42816B", marginBottom: 8 },
  pageTitle: { fontSize: 29, fontWeight: "700", letterSpacing: -0.4, color: "#163D30" },
  subtitle: { fontSize: 13, lineHeight: 19, color: "#6F8276", marginTop: 5 },
  backButton: { flexDirection: "row", gap: 6, alignItems: "center", minHeight: 40, paddingHorizontal: 11, borderRadius: 8, borderWidth: 1, borderColor: "#D6E5DB" },
  backText: { color: "#23765F", fontSize: 12, fontWeight: "600" },
  identity: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 17, paddingVertical: 22, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DCE8DF", marginBottom: 31 },
  avatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: "#186452", justifyContent: "center", alignItems: "center" },
  avatarText: { color: "#FFFFFF", fontSize: 23, fontWeight: "700" },
  identityCopy: { flex: 1, minWidth: 190 },
  personName: { color: "#163D30", fontSize: 21, lineHeight: 27, fontWeight: "700" },
  personEmail: { color: "#6F8276", fontSize: 12.5, marginTop: 4 },
  roleLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 5, marginTop: 10 },
  roleText: { color: "#2C6D57", fontSize: 11.5, fontWeight: "600" },
  separator: { color: "#779085", fontWeight: "700" },
  twoColumns: { flexDirection: "row", gap: 34, alignItems: "flex-start" },
  twoColumnsCompact: { flexDirection: "column", gap: 26 },
  primaryColumn: { flex: 1.12, minWidth: 0 },
  secondaryColumn: { flex: 1, minWidth: 0 },
  sectionTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { color: "#183E32", fontSize: 16, fontWeight: "700" },
  sectionDescription: { color: "#75877D", fontSize: 12, lineHeight: 18, marginTop: 5, marginBottom: 13 },
  editButton: { paddingHorizontal: 11, minHeight: 37, borderRadius: 8, borderWidth: 1, borderColor: "#D6E5DB", flexDirection: "row", alignItems: "center", gap: 7 },
  editText: { color: "#23765F", fontSize: 12, fontWeight: "700" },
  detail: { paddingVertical: 13, borderBottomWidth: 1, borderColor: "#E0E9E3" },
  detailLabel: { color: "#778A7F", fontSize: 11.5, fontWeight: "500", marginBottom: 6 },
  detailValue: { color: "#233F34", fontSize: 13, fontWeight: "600", lineHeight: 20 },
  form: { gap: 8, marginTop: 5 },
  fieldLabel: { color: "#395F4F", fontSize: 12, fontWeight: "600", marginTop: 5 },
  input: { minHeight: 44, borderRadius: 8, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "#CCDCD2", paddingHorizontal: 13, color: "#1A3E31", fontSize: 13 },
  buttonRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14 },
  saveButton: { minHeight: 42, minWidth: 132, justifyContent: "center", alignItems: "center", paddingHorizontal: 15, backgroundColor: "#23765F", borderRadius: 8 },
  saveText: { color: "#FFFFFF", fontSize: 12.5, fontWeight: "700" },
  cancelButton: { minHeight: 42, justifyContent: "center", paddingHorizontal: 15, borderRadius: 8, borderWidth: 1, borderColor: "#CDDBD2" },
  cancelText: { color: "#486858", fontSize: 12.5, fontWeight: "600" },
  success: { color: "#1F7856", fontSize: 12.5, marginTop: 12 },
  error: { color: "#B34835", fontSize: 12.5, marginTop: 12 },
  infoNote: { flexDirection: "row", gap: 9, borderTopWidth: 1, borderColor: "#DFE9E1", marginTop: 20, paddingTop: 15 },
  infoText: { color: "#6B8174", flex: 1, fontSize: 11.5, lineHeight: 18 },
});
