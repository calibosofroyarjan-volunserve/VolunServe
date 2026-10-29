import Ionicons from "@expo/vector-icons/Ionicons";
import { useRouter } from "expo-router";
import { collection, onSnapshot } from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { db } from "../../lib/firebase";
import { isApprovedProfile } from "../../lib/firebaseAuth";
import { useUserSession } from "../../lib/useUserSession";
import ListPagination from "../ui/ListPagination";

type Activity = { id: string; category: string; label: string; detail: string; millis: number; route: string };
type Source = "disasterCases" | "volunteerApplications" | "communityEvents";
const PAGE_SIZE = 5;
const SOURCES: { key: Source; title: string; route: string }[] = [
  { key: "disasterCases", title: "Emergency report", route: "/(admin)/admin-cases" },
  { key: "volunteerApplications", title: "Volunteer application", route: "/(admin)/command-center?section=volunteers" },
  { key: "communityEvents", title: "Community event", route: "/(admin)/community-events" },
];
function recordedAt(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "object") {
    const data = value as { toMillis?: () => number; seconds?: number };
    if (typeof data.toMillis === "function") return data.toMillis();
    if (typeof data.seconds === "number") return data.seconds * 1000;
  }
  if (typeof value === "string") {
    const result = Date.parse(value);
    return Number.isFinite(result) ? result : 0;
  }
  return 0;
}
function dateLabel(millis: number) {
  return millis > 0
    ? new Date(millis).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })
    : "Date not recorded";
}
const safeText = (value: unknown, fallback: string) => typeof value === "string" && value.trim() ? value.trim() : fallback;

/** A filtered operational activity feed; not the restricted programmer-only admin audit log. */
export default function DashboardRecentActivities() {
  const router = useRouter();
  const { user, profile } = useUserSession();
  const authorized = !!user && !!profile && profile.role === "admin" &&
    profile.adminStatus !== "suspended" && isApprovedProfile(profile);
  const [records, setRecords] = useState<Partial<Record<Source, Activity[]>>>({});
  const [ready, setReady] = useState<Partial<Record<Source, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Source, boolean>>>({});
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (!authorized) return;
    const unsubscribers = SOURCES.map(source =>
      onSnapshot(collection(db, source.key), snapshot => {
        const rows: Activity[] = snapshot.docs.map(item => {
          const data = item.data();
          const status = safeText(data.status, "Recorded");
          const label = safeText(data.title || data.name || data.fullName || data.disasterType || data.type, source.title);
          const time = recordedAt(data.updatedAt || data.reviewedAt || data.createdAt || data.reportedAt || data.timestamp);
          return { id: item.id, category: source.title, label, detail: status.replace(/_/g, " "),
            millis: time, route: source.route };
        });
        setRecords(old => ({ ...old, [source.key]: rows }));
        setReady(old => ({ ...old, [source.key]: true }));
        setErrors(old => ({ ...old, [source.key]: false }));
      }, error => {
        console.warn("LGU activity source unavailable", source.key, error.code);
        setErrors(old => ({ ...old, [source.key]: true }));
        setReady(old => ({ ...old, [source.key]: true }));
      }),
    );
    return () => unsubscribers.forEach(stop => stop());
  }, [authorized]);

  const items = useMemo(() => SOURCES.flatMap(s => records[s.key] || [])
    .sort((a, b) => b.millis - a.millis || a.category.localeCompare(b.category)), [records]);
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const visible = items.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const loading = SOURCES.some(source => !ready[source.key]);
  const unavailable = SOURCES.some(source => errors[source.key]);

  if (!authorized) return null;
  return (
    <View style={styles.panel} accessibilityLabel="Recent LGU operational activities">
      <View style={styles.heading}>
        <View style={styles.copy}>
          <Text style={styles.eyebrow}>LGU OPERATIONS / RECENT RECORDS</Text>
          <Text style={styles.title}>Recent Operational Activity</Text>
          <Text style={styles.subtitle}>Latest emergency reports, volunteer applications and community events, based on recorded timestamps.</Text>
        </View>
        <Ionicons name="time-outline" size={23} color="#177155" />
      </View>
      {loading ? <View style={styles.empty}><ActivityIndicator color="#16795B" /><Text style={styles.muted}>Loading live activity records…</Text></View> : <>
        {unavailable && <Text style={styles.warning}>Some sources are unavailable. Only accessible records are shown; this is not the restricted audit log.</Text>}
        <ListPagination page={safePage} total={items.length} pageSize={PAGE_SIZE} onChange={setPage} />
        {visible.length === 0 ? <Text style={styles.emptyText}>No operational records available yet.</Text> :
          visible.map(item => (
            <TouchableOpacity key={item.category + ":" + item.id}
              accessibilityRole="button" accessibilityLabel={item.category + ": " + item.label}
              style={styles.row} onPress={() => router.push(item.route as any)}>
              <View style={styles.icon}><Ionicons name="document-text-outline" size={18} color="#226C55" /></View>
              <View style={styles.rowContent}>
                <Text style={styles.recordLabel} numberOfLines={1}>{item.label}</Text>
                <Text style={styles.recordDetail} numberOfLines={2}>{item.category} · {item.detail}</Text>
              </View>
              <Text style={styles.date}>{dateLabel(item.millis)}</Text>
              <Ionicons name="chevron-forward" size={15} color="#84968B" />
            </TouchableOpacity>
          ))}
      </>}
    </View>
  );
}
const styles = StyleSheet.create({
  panel: { marginTop: 11, borderWidth: 1, borderColor: "#DBE9DF", borderRadius: 12, backgroundColor: "#FFFFFF", padding: 15 },
  heading: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  copy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6, color: "#197459" },
  title: { fontSize: 17, fontWeight: "800", color: "#183E32", marginTop: 4 },
  subtitle: { fontSize: 11.5, lineHeight: 17, color: "#62766B", marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 9, borderTopWidth: 1, borderTopColor: "#E9EFEA", paddingVertical: 10 },
  icon: { width: 32, height: 32, backgroundColor: "#EFF7F1", borderRadius: 8, alignItems: "center", justifyContent: "center" },
  rowContent: { flex: 1, minWidth: 0 },
  recordLabel: { fontSize: 12.5, fontWeight: "700", color: "#244735" },
  recordDetail: { fontSize: 11, color: "#6C8073", marginTop: 2 },
  date: { fontSize: 10.5, color: "#72887A", maxWidth: 155, textAlign: "right" },
  empty: { flexDirection: "row", alignItems: "center", gap: 9, paddingVertical: 15 },
  emptyText: { color: "#738477", fontSize: 12, paddingVertical: 13 },
  muted: { color: "#738477", fontSize: 12 },
  warning: { fontSize: 11, color: "#9B6535", marginTop: 9, lineHeight: 16 },
});
