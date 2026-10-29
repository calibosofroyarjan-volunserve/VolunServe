import Ionicons from "@expo/vector-icons/Ionicons";
import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";
import { db } from "../../lib/firebase";
import ListPagination from "../ui/ListPagination";
import WorkspaceBarChart from "../ui/WorkspaceBarChart";

type EventRow = { id: string; title?: string; status?: string; date?: string; publicationStatus?: string; };
type StatsRow = { totalHours?: number; totalEvents?: number };
type InsightData = { publishedEvents: EventRow[]; certificates: number | null; stats: StatsRow[] | null };
type Workload = { emergency: number | null; approvals: number | null; relief: number | null };
const PAGE_SIZE = 5;
const cleanDate = (value: string | undefined) => String(value || "").slice(0, 10) || "Date not recorded";

export default function DashboardOperationalInsights({ workload }: { workload?: Workload }) {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const stacked = width < 1050;
  const [data, setData] = useState<InsightData>({ publishedEvents: [], certificates: null, stats: null });
  const [loaded, setLoaded] = useState({ events: false, certificates: false, stats: false });
  const [errors, setErrors] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    const watch = (path: string, key: keyof typeof loaded,
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
          .map(row => ({ id: row.id, title: String(row.data.title || "Community event"),
            status: String(row.data.status || "upcoming"), date: String(row.data.date || "") })) }))),
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
  const eventsCount = loaded.events && !errors.includes("communityEvents") ? data.publishedEvents.length : null;
  const completedCount = loaded.events && !errors.includes("communityEvents")
    ? data.publishedEvents.filter(row => row.status === "completed").length : null;
  const kpis = [
    { label: "Published Events", value: eventsCount, icon: "calendar-outline" as const },
    { label: "Completed Events", value: completedCount, icon: "checkmark-done-outline" as const },
    { label: "Certificates Issued", value: loaded.certificates && !errors.includes("certificates") ? data.certificates : null, icon: "ribbon-outline" as const },
    { label: "Volunteer Hours Served", value: loaded.stats && !errors.includes("volunteerStats") && hours !== null ? Number(hours.toFixed(1)) : null, icon: "time-outline" as const },
  ];
  const bars = [
    { key: "cases", label: "Open emergency cases", shortLabel: "Emergency", value: workload?.emergency ?? null, color: "#28765D" },
    { key: "reviews", label: "Pending reviews", shortLabel: "Approvals", value: workload?.approvals ?? null, color: "#426D9B" },
    { key: "needs", label: "Open relief needs", shortLabel: "Relief", value: workload?.relief ?? null, color: "#C18A43" },
  ];
  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <View style={styles.headingCopy}>
          <Text style={styles.eyebrow}>COMMAND CENTER / LGU OPERATIONS</Text>
          <Text style={styles.title}>Service Analytics</Text>
          <Text style={styles.description}>Operational reports, completed services and Volunteer hours. No personal gamification metrics.</Text>
        </View>
        <Ionicons name="analytics-outline" color="#19785C" size={22} />
      </View>
      <View style={styles.metrics}>
        {kpis.map(item => <View key={item.label} style={styles.metric}>
          <View style={styles.metricTop}>
            <Text style={styles.metricName}>{item.label}</Text>
            <Ionicons name={item.icon} color="#14765C" size={17} />
          </View>
          <Text style={styles.metricValue}>{item.value === null ? "—" : item.value.toLocaleString("en-PH")}</Text>
        </View>)}
      </View>
      <View style={[styles.columns, stacked && styles.columnsStack]}>
        <View style={[styles.chartPanel, stacked && styles.panelStack]}>
          <WorkspaceBarChart title="Service Workload" subtitle="Current LGU operational cases and review queues"
            orientation="vertical" bars={bars} footer="Authorized live operational counts" />
        </View>
        <View style={[styles.activity, stacked && styles.panelStack]}>
          <View style={styles.activityHeading}>
            <View style={styles.activityTitleWrap}>
              <Text style={styles.listTitle}>Published Community Events</Text>
              <Text style={styles.listSubtitle}>Upcoming and completed activities</Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(admin)/community-attendance" as any)} accessibilityRole="button" style={styles.link}>
              <Text style={styles.linkText}>Event Attendance</Text>
              <Ionicons name="arrow-forward-outline" color="#15785E" size={14} />
            </TouchableOpacity>
          </View>
          <ListPagination page={activePage} total={recent.length} pageSize={PAGE_SIZE} onChange={setPage} />
          {visible.length === 0 ? <Text style={styles.empty}>{loaded.events ? "No published community events found." : "Loading event records…"}</Text> :
            visible.map(event => <View key={event.id} style={styles.event}>
              <View style={styles.eventCopy}>
                <Text numberOfLines={1} style={styles.eventName}>{event.title}</Text>
                <Text style={styles.eventMeta}>{cleanDate(event.date)} · {event.status || "upcoming"}</Text>
              </View>
            </View>)}
          {errors.length > 0 && <Text style={styles.notice}>Some sources are unavailable; missing totals display — rather than zero.</Text>}
        </View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  root: { marginTop: 3, gap: 11 },
  heading: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 10, letterSpacing: 0.7, fontWeight: "700", color: "#137558" },
  title: { fontSize: 19, fontWeight: "800", color: "#173D32", marginTop: 4 },
  description: { fontSize: 11.5, color: "#63796D", marginTop: 3, lineHeight: 17 },
  metrics: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  metric: { flex: 1, flexBasis: "22%", minWidth: 145, borderColor: "#DAE7DE", borderWidth: 1,
    borderRadius: 10, backgroundColor: "#FFFFFF", padding: 12, gap: 7 },
  metricTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  metricName: { color: "#537366", fontSize: 11, fontWeight: "700", flex: 1 },
  metricValue: { color: "#15513C", fontSize: 23, fontWeight: "800", fontVariant: ["tabular-nums"] },
  columns: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  columnsStack: { flexDirection: "column" },
  chartPanel: { flex: 0.85, minWidth: 0, padding: 14, borderWidth: 1, borderColor: "#DBE7DF", borderRadius: 11, backgroundColor: "#FFFFFF" },
  panelStack: { width: "100%", flex: 0 },
  activity: { flex: 1.15, minWidth: 0, borderColor: "#DBE7DF", borderWidth: 1, borderRadius: 11, backgroundColor: "#FFFFFF", padding: 14 },
  activityHeading: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 8 },
  activityTitleWrap: { flex: 1, minWidth: 150 },
  listTitle: { fontWeight: "800", fontSize: 13.5, color: "#174534" },
  listSubtitle: { fontSize: 11, color: "#708579", marginTop: 3 },
  link: { flexDirection: "row", alignItems: "center", gap: 5, minHeight: 32 },
  linkText: { fontSize: 11, fontWeight: "700", color: "#15785E" },
  empty: { color: "#648174", fontSize: 11.5, paddingVertical: 12 },
  event: { flexDirection: "row", borderTopWidth: 1, borderTopColor: "#E7EFE9", paddingVertical: 8 },
  eventCopy: { flex: 1 },
  eventName: { color: "#174534", fontSize: 12, fontWeight: "700" },
  eventMeta: { color: "#648174", fontSize: 10.5, marginTop: 2 },
  notice: { color: "#805D3D", fontSize: 11, lineHeight: 16, marginTop: 7 },
});
