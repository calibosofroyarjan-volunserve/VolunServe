import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { db } from "../../lib/firebase";
import ListPagination from "../ui/ListPagination";

type EventRow = { id: string; title?: string; status?: string; date?: string; publicationStatus?: string; };
type StatsRow = { totalHours?: number; totalEvents?: number; };
type InsightData = { publishedEvents: EventRow[]; legacyEvents: EventRow[]; certificates: number | null; stats: StatsRow[] | null; };
const PAGE_SIZE = 5;
const cleanDate = (value: string | undefined) => String(value || "").slice(0, 10) || "No date";

export default function DashboardOperationalInsights() {
  const router = useRouter();
  const [data, setData] = useState<InsightData>({
    publishedEvents: [], legacyEvents: [], certificates: null, stats: null,
  });
  const [loaded, setLoaded] = useState({ events: false, archived: false, certificates: false, stats: false });
  const [errors, setErrors] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const watch = <T,>(path: string, key: keyof typeof loaded,
      update: (records: { id: string; data: Record<string, unknown> }[]) => void) =>
      onSnapshot(collection(db, path), snapshot => {
        update(snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })));
        setLoaded(prev => ({ ...prev, [key]: true }));
        setErrors(prev => prev.filter(item => item !== path));
      }, error => {
        console.log("Admin operational insights unavailable:", path, error);
        setLoaded(prev => ({ ...prev, [key]: true }));
        setErrors(prev => [...new Set([...prev, path])]);
      });
    const cleanups = [
      watch("communityEvents", "events", records =>
        setData(prev => ({ ...prev, publishedEvents: records
          .filter(row => row.data.publicationStatus === "published")
          .map(row => ({ id: row.id, title: String(row.data.title || "Community event"), status: String(row.data.status || "upcoming"), date: String(row.data.date || "") })) }))),
      // Legacy Volunteer Events stay in Firestore for records preservation, but not in a duplicate Admin module.
      watch("volunteerEvents", "archived", records =>
        setData(prev => ({ ...prev, legacyEvents: records.map(row => ({ id: row.id, title: String(row.data.title || "Legacy event"), status: String(row.data.status || "upcoming"), date: String(row.data.date || "") })) }))),
      watch("certificates", "certificates", records => setData(prev => ({ ...prev, certificates: records.length }))),
      watch("volunteerStats", "stats", records => setData(prev => ({ ...prev, stats: records.map(row => row.data as StatsRow) }))),
    ];
    return () => cleanups.forEach(stop => stop());
  }, []);

  const recent = useMemo(() => [...data.publishedEvents]
    .sort((a, b) => (b.date || "").localeCompare(a.date || "")), [data.publishedEvents]);
  const activePage = Math.max(1, Math.min(page, Math.max(1, Math.ceil(recent.length / PAGE_SIZE))));
  const visible = recent.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);
  const hours = data.stats?.reduce((sum, item) => sum + Math.max(0, Number(item.totalHours || 0)), 0) ?? null;
  const kpis = [
    { label: "Published community events", value: loaded.events && !errors.includes("communityEvents") ? data.publishedEvents.length : null, icon: "calendar-outline" as const },
    { label: "Completed community events", value: loaded.events && !errors.includes("communityEvents") ? data.publishedEvents.filter(row => row.status === "completed").length : null, icon: "checkmark-circle-outline" as const },
    { label: "Certificates issued", value: data.certificates, icon: "ribbon-outline" as const },
    { label: "Volunteer service hours", value: hours === null ? null : Number(hours.toFixed(1)), icon: "time-outline" as const },
  ];
  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>LGU COMMAND CENTER / OPERATIONAL INSIGHTS</Text>
          <Text style={styles.title}>Service Analytics</Text>
          <Text style={styles.description}>Live program totals and recent approved activities, alongside the emergency and approvals overview.</Text>
        </View>
        <Ionicons name="analytics-outline" color="#14785A" size={26} />
      </View>
      <View style={styles.metrics}>
        {kpis.map(item => <View key={item.label} style={styles.metric}>
          <Ionicons name={item.icon} color="#15785E" size={19} />
          <Text style={styles.metricName}>{item.label}</Text>
          <Text style={styles.metricValue}>{item.value === null ? "—" : item.value.toLocaleString("en-PH")}</Text>
        </View>)}
      </View>
      <View style={styles.activity}>
        <View style={styles.activityHeading}>
          <Text style={styles.listTitle}>Recent Published Community Events</Text>
          <TouchableOpacity onPress={() => router.push("/(admin)/community-attendance" as any)} accessibilityRole="button" style={styles.link}>
            <Text style={styles.linkText}>Open Event Attendance</Text>
            <Ionicons name="arrow-forward-outline" color="#15785E" size={16} />
          </TouchableOpacity>
        </View>
        <ListPagination page={activePage} total={recent.length} pageSize={PAGE_SIZE} onChange={setPage} />
        {visible.length === 0 ? <Text style={styles.empty}>{loaded.events ? "No published community events found." : "Loading event records…"}</Text> :
          visible.map(event => <View key={event.id} style={styles.event}>
            <View style={styles.eventCopy}>
              <Text style={styles.eventName}>{event.title}</Text>
              <Text style={styles.eventMeta}>{cleanDate(event.date)} · {event.status || "upcoming"}</Text>
            </View>
          </View>)}
        {errors.length > 0 && <Text style={styles.notice}>Some analytics sources are unavailable; missing totals show —, not zero.</Text>}
        {data.legacyEvents.length > 0 && <Text style={styles.notice}>{data.legacyEvents.length} historical Volunteer Event record(s) remain archived in Firestore. The separate management screen is retired; Community Events and Event Attendance are the current workflows.</Text>}
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { marginTop: 18, marginBottom: 24, gap: 13 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, letterSpacing: 1.2, fontWeight: "800", color: "#087A60" },
  title: { fontSize: 21, fontWeight: "800", color: "#123F32", marginTop: 5 },
  description: { fontSize: 12, color: "#658073", marginTop: 4, lineHeight: 18 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  metric: { flexGrow: 1, flexBasis: "22%", minWidth: 160, borderColor: "#D7E7DD", borderWidth: 1, borderRadius: 12, backgroundColor: "#F6FBF8", padding: 16, gap: 7 },
  metricName: { color: "#526F60", fontSize: 12, fontWeight: "700" },
  metricValue: { color: "#104D39", fontSize: 25, fontWeight: "800" },
  activity: { borderColor: "#E0EBE4", borderWidth: 1, borderRadius: 14, backgroundColor: "#FFFFFF", padding: 16 },
  activityHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 10 },
  listTitle: { fontWeight: "800", fontSize: 14, color: "#174534" },
  link: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44 },
  linkText: { fontSize: 12, fontWeight: "700", color: "#15785E" },
  empty: { color: "#648174", paddingVertical: 14 },
  event: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E7EFE9", paddingVertical: 11 },
  eventCopy: { flex: 1 },
  eventName: { color: "#174534", fontSize: 13, fontWeight: "700" },
  eventMeta: { color: "#648174", fontSize: 12, marginTop: 3 },
  notice: { color: "#7A6850", fontSize: 11, lineHeight: 17, marginTop: 8 },
});
