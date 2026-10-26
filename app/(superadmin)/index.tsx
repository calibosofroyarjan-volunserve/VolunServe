import { collection, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
  Platform, ScrollView, StyleSheet, Text,
  View, useWindowDimensions,
} from "react-native";
import WorkspaceBarChart from "../../components/ui/WorkspaceBarChart";
import { db } from "../../lib/firebase";
import { useUserSession } from "../../lib/useUserSession";

type Source = "users" | "disasterCases" | "assistanceRequests" | "communityEvents";
const SOURCES: { key: Source; label: string }[] = [
  { key: "users", label: "Registered Accounts" },
  { key: "disasterCases", label: "Emergency Reports" },
  { key: "assistanceRequests", label: "Assistance Requests" },
  { key: "communityEvents", label: "Community Events" },
];

export default function SuperAdminDashboard() {
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const { user, profile } = useUserSession();
  const authorized = !!user && profile?.role === "superadmin" && profile?.status === "approved";
  const [counts, setCounts] = useState<Partial<Record<Source, number>>>({});
  const [approved, setApproved] = useState<number | null>(null);
  const [errors, setErrors] = useState<Partial<Record<Source, boolean>>>({});
  const [loaded, setLoaded] = useState<Partial<Record<Source, boolean>>>({});

  useEffect(() => {
    if (!authorized) {
      setCounts({});
      setApproved(null);
      setErrors({});
      setLoaded({});
      return;
    }
    const stops = SOURCES.map(({ key }) => onSnapshot(
      collection(db, key),
      (snapshot) => {
        setCounts((old) => ({ ...old, [key]: snapshot.size }));
        if (key === "users") {
          setApproved(snapshot.docs.filter((doc) => doc.data().status === "approved").length);
        }
        setErrors((old) => ({ ...old, [key]: false }));
        setLoaded((old) => ({ ...old, [key]: true }));
      },
      (error) => {
        console.warn("Super Admin overview source unavailable", key, error.code);
        setErrors((old) => ({ ...old, [key]: true }));
        setLoaded((old) => ({ ...old, [key]: true }));
      },
    ));
    return () => stops.forEach((stop) => stop());
  }, [authorized]);

  const total = counts.users ?? 0;
  const approvedPercentage = total > 0 && approved !== null
    ? Math.round((approved / total) * 100) : null;
  const data = useMemo(() => SOURCES.map(({ key, label }) => ({
    key, label,
    value: errors[key] || !loaded[key] ? null : (counts[key] ?? 0),
  })), [counts, errors, loaded]);
  const hasUnavailable = SOURCES.some(({ key }) => errors[key]);
  const allLoaded = SOURCES.every(({ key }) => loaded[key]);
  const showApproval = loaded.users && !errors.users && approved !== null;

  return (
    <ScrollView
      style={[styles.screen, Platform.OS === "web" && styles.webScroll]}
      contentContainerStyle={[styles.content, compact && styles.compactContent]}
      showsVerticalScrollIndicator
      accessibilityLabel="Super Admin dashboard"
    >
      <View style={styles.header}>
        <View style={styles.eyebrowRow}>
          <View style={styles.dot} />
          <Text style={styles.eyebrow}>SYSTEM ADMINISTRATION</Text>
        </View>
        <Text style={[styles.title, compact && styles.compactTitle]}>System overview</Text>
        <Text style={styles.subtitle}>Access governance and system records for VolunServe.</Text>
      </View>

      <View style={[styles.metricRow, compact && styles.metricRowCompact]}>
        {[
          { key: "users" as Source, label: "Accounts" },
          { key: "disasterCases" as Source, label: "Emergency Reports" },
          { key: "assistanceRequests" as Source, label: "Assistance Requests" },
          { key: "communityEvents" as Source, label: "Community Events" },
        ].map((item) =>
          <View key={item.key} style={[styles.metric, compact && styles.metricCompact]}>
            <Text style={styles.metricLabel}>{item.label}</Text>
            <Text style={styles.metricValue}>
              {errors[item.key] ? "—" : !loaded[item.key] ? "…" : (counts[item.key] ?? 0).toLocaleString("en-PH")}
            </Text>
          </View>,
        )}
      </View>

      <WorkspaceBarChart
        title="Records by service area"
        subtitle="Comparison of live Firestore record totals. Bars represent counts, not monthly trends."
        bars={data}
        footer={allLoaded && !hasUnavailable
          ? "Source: authorized Firestore records. Values update when records change."
          : "Some sources are loading or unavailable. Missing counts are never shown as zero."}
      />

      <View style={styles.secondarySection}>
        <View style={styles.secondaryHead}>
          <Text style={styles.sectionTitle}>Account authorization</Text>
          <Text style={styles.sectionHint}>Registered account status</Text>
        </View>
        {showApproval ?
          <View style={styles.approvalRow}>
            <View style={styles.approvalMain}>
              <Text style={styles.largePercentage}>{approvedPercentage ?? 0}%</Text>
              <Text style={styles.approvalDescription}>
                {approved?.toLocaleString("en-PH")} approved of {total.toLocaleString("en-PH")} registered accounts
              </Text>
            </View>
            <View style={styles.percentageTrack}>
              <View style={[styles.percentageFill, { width: `${approvedPercentage ?? 0}%` as `${number}%` }]} />
            </View>
          </View> :
          <Text style={styles.pendingText}>
            {!loaded.users ? "Loading account status…" : "Account approval figures are unavailable."}
          </Text>
        }
        <Text style={styles.note}>
          Review LGU credentials before granting Admin permissions. System administrators manage access and settings; operational donations belong to the LGU Admin workspace.
        </Text>
      </View>

      {hasUnavailable &&
        <Text style={styles.error}>Some records could not be read. Check deployed Firestore permissions before presenting these totals.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, minHeight: 0, backgroundColor: "#F6F8F7" },
  webScroll: { overflowY: "scroll", scrollbarWidth: "auto", scrollbarColor: "#A4B7AF #F6F8F7" } as any,
  content: { width: "100%", maxWidth: 1250, alignSelf: "center", paddingHorizontal: 38, paddingTop: 36, paddingBottom: 70 },
  compactContent: { paddingHorizontal: 17, paddingTop: 24 },
  header: { paddingBottom: 28 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#23765F" },
  eyebrow: { color: "#568174", fontSize: 10, fontWeight: "700", letterSpacing: 1.3 },
  title: { fontSize: 31, lineHeight: 38, letterSpacing: -0.6, fontWeight: "700", color: "#133A30" },
  compactTitle: { fontSize: 26, lineHeight: 33 },
  subtitle: { color: "#688076", fontSize: 13, lineHeight: 19, marginTop: 7 },
  metricRow: { flexDirection: "row", flexWrap: "wrap", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DDE6E1", marginBottom: 30 },
  metricRowCompact: { flexWrap: "wrap" },
  metric: { flexGrow: 1, flexBasis: "24%", minWidth: 148, paddingVertical: 20, paddingHorizontal: 14 },
  metricCompact: { flexBasis: "50%", minWidth: 135 },
  metricLabel: { fontSize: 11, fontWeight: "600", color: "#62786F" },
  metricValue: { fontSize: 28, fontWeight: "700", color: "#173D32", marginTop: 6, fontVariant: ["tabular-nums"] },
  secondarySection: { marginTop: 34 },
  secondaryHead: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#173D32" },
  sectionHint: { fontSize: 12, color: "#6C7F77" },
  approvalRow: { paddingVertical: 17, borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#DDE6E1" },
  approvalMain: { flexDirection: "row", alignItems: "baseline", flexWrap: "wrap", gap: 12 },
  largePercentage: { fontSize: 35, fontWeight: "700", color: "#23765F", fontVariant: ["tabular-nums"] },
  approvalDescription: { fontSize: 13, color: "#566B61" },
  percentageTrack: { height: 7, borderRadius: 3, backgroundColor: "#E4ECE7", marginTop: 16, overflow: "hidden" },
  percentageFill: { backgroundColor: "#23765F", height: "100%", borderRadius: 3 },
  pendingText: { fontSize: 13, color: "#6C7F77", paddingVertical: 15 },
  note: { color: "#64776E", fontSize: 12, lineHeight: 19, paddingTop: 16, maxWidth: 850 },
  error: { fontSize: 12, color: "#A45125", marginTop: 20 },
});
