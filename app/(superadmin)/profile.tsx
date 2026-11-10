import { volunserveTypography as vsType } from "../../constants/volunserveLiveUi";
import { liveUi as designUi } from "../../constants/volunserveLiveUi";
import { Ionicons } from "@expo/vector-icons";
import { Redirect } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { isSuperAdminProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";

const EMERALD = "#087A62";

export default function SuperAdminProfile() {
  const { loading, user, profile } = useUserSession();
  const { width } = useWindowDimensions();
  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={EMERALD} size="large" />
        <Text style={styles.loadingCopy}>Loading account profile...</Text>
      </View>
    );
  }
  if (!user || !isSuperAdminProfile(profile)) {
    return <Redirect href="/admin-login" />;
  }

  const name = String(profile?.fullName || user.displayName || user.email || "Super Admin").trim();
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join("") || "SA";
  const email = user.email || profile?.email || "Not provided";
  const phone = profile?.phoneNumber?.trim() || "Not provided";
  const accountStatus = profile?.status === "approved" || !profile?.status ? "Approved" : "Review required";
  const accessStatus = profile?.adminStatus === "suspended" ? "Suspended" : accountStatus;

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container}>
      <View style={styles.heading}>
        <View style={styles.headingIcon}>
          <Ionicons name="person-circle-outline" size={24} color={EMERALD} />
        </View>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>ACCOUNT MANAGEMENT</Text>
          <Text style={styles.title}>My Profile</Text>
          <Text style={styles.subtitle}>Your official Super Admin account information.</Text>
        </View>
      </View>

      <View style={styles.profileCard}>
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.identity}>
            <Text style={styles.name}>{name}</Text>
            <Text style={styles.role}>Super Administrator</Text>
            <Text style={styles.email}>{email}</Text>
          </View>
          <View style={styles.statusBadge}>
            <Ionicons name="shield-checkmark-outline" size={15} color="#087A62" />
            <Text style={styles.statusText}>{accessStatus}</Text>
          </View>
        </View>
        <View style={styles.divider} />
        <Text style={styles.sectionTitle}>Account Details</Text>
        <View style={styles.infoGrid}>
          <Detail label="Full Name" value={name} wide={width < 780} />
          <Detail label="Email Address" value={email} wide={width < 780} />
          <Detail label="Account Role" value="Super Admin" wide={width < 780} />
          <Detail label="Account Status" value={accessStatus} wide={width < 780} />
          <Detail label="Contact Number" value={phone} wide={width < 780} />
          <Detail label="Account ID" value={user.uid} wide={width < 780} />
        </View>
      </View>
      <View style={styles.notice}>
        <Ionicons name="lock-closed-outline" size={18} color="#34735E" />
        <Text style={styles.noticeText}>
          This profile is read-only. Your account information is retrieved from the current signed-in session.
        </Text>
      </View>
    </ScrollView>
  );
}

function Detail({ label, value, wide }: { label: string; value: string; wide: boolean }) {
  return (
    <View style={[styles.detail, wide && styles.detailWide]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: "#F6F9F8" },
  container: { paddingHorizontal: 24, paddingVertical: 24, paddingBottom: 44, gap: 18, maxWidth: 1250, width: "100%", alignSelf: "center" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingCopy: { color: "#527568", fontWeight: "700" },
  heading: { flexDirection: "row", alignItems: "center", gap: 14, padding: 21, backgroundColor: "#E4F3EA", borderRadius: 15, borderWidth: 1, borderColor: "#D3E8DB" },
  headingIcon: { width: 50, height: 50, borderRadius: 14, backgroundColor: "#CFF1E1", alignItems: "center", justifyContent: "center" },
  headingCopy: { flex: 1, gap: 5 },
  eyebrow: { color: "#087A62", fontWeight: "800", fontSize: vsType.size.micro, fontFamily: vsType.family, letterSpacing: 1.8 },
  title: { color: "#073E32", fontSize: designUi.type.page.fontSize, fontWeight: designUi.type.page.fontWeight, lineHeight: designUi.type.page.lineHeight,},
  subtitle: { fontSize: designUi.type.body.fontSize, color: "#648276", lineHeight: designUi.type.body.lineHeight, fontWeight: designUi.type.body.fontWeight,},
  profileCard: { padding: 24, borderRadius: 16, borderColor: "#DCE9E1", borderWidth: 1, backgroundColor: "#FFFFFF", gap: 21 },
  profileHeader: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 17 },
  avatar: { width: 70, height: 70, borderRadius: 35, backgroundColor: EMERALD, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#FFFFFF", fontWeight: "800", fontSize: vsType.size.title, fontFamily: vsType.family },
  identity: { flex: 1, minWidth: 200, gap: 5 },
  name: { color: "#073E32", fontSize: vsType.size.titleSmall, fontFamily: vsType.family, fontWeight: "800" },
  role: { color: "#087A62", fontSize: vsType.size.meta, fontFamily: vsType.family, fontWeight: "800" },
  email: { color: "#6B8478", fontSize: vsType.size.meta, fontFamily: vsType.family },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, backgroundColor: "#E2F8EB" },
  statusText: { color: "#087A62", fontSize: vsType.size.caption, fontFamily: vsType.family, fontWeight: "800" },
  divider: { height: 1, backgroundColor: "#E8F0EA" },
  sectionTitle: { fontSize: designUi.type.section.fontSize, fontWeight: designUi.type.section.fontWeight, color: "#153E33", lineHeight: designUi.type.section.lineHeight,},
  infoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 13 },
  detail: { flexBasis: "47%", flexGrow: 1, minWidth: 205, minHeight: 90, padding: 14, borderWidth: 1, borderColor: "#E5EEE8", backgroundColor: "#F8FBF9", borderRadius: 11, gap: 10 },
  detailWide: { flexBasis: "100%", minWidth: 0 },
  detailLabel: { fontSize: designUi.type.label.fontSize, fontWeight: designUi.type.label.fontWeight, color: "#688477", textTransform: "uppercase", letterSpacing: 0.7, lineHeight: designUi.type.label.lineHeight,},
  detailValue: { fontSize: vsType.size.label, fontFamily: vsType.family, fontWeight: "700", color: "#1E4939" },
  notice: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 15, borderRadius: 11, borderColor: "#DBECE2", borderWidth: 1, backgroundColor: "#EDF6F0" },
  noticeText: { flex: 1, fontSize: vsType.size.meta, fontFamily: vsType.family, lineHeight: 19, color: "#456D5B" },
});
