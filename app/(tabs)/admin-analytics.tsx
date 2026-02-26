import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../../lib/firebase";

type Role = "user" | "volunteer" | "admin" | "superadmin" | string;

type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type EventStatus = "upcoming" | "active" | "completed";

type VolunteerAppStatus = "pending" | "approved" | "rejected";

export default function AdminAnalytics() {
  const router = useRouter();

  const [checkingRole, setCheckingRole] = useState(true);
  const [role, setRole] = useState<Role>("user");
  const allowed = role === "admin" || role === "superadmin";

  // ---- DATA ----
  const [caseDocs, setCaseDocs] = useState<any[]>([]);
  const [eventDocs, setEventDocs] = useState<any[]>([]);
  const [appDocs, setAppDocs] = useState<any[]>([]);
  const [statDocs, setStatDocs] = useState<any[]>([]);
  const [donationDocs, setDonationDocs] = useState<any[]>([]);

  // 1) ROLE GUARD
  useEffect(() => {
    const run = async () => {
      const auth = getAuth();
      const user = auth.currentUser;

      if (!user) {
        router.replace("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const r = (snap.data()?.role || "user").toString().trim().toLowerCase();
        setRole(r);
      } catch {
        setRole("user");
      } finally {
        setCheckingRole(false);
      }
    };

    run();
  }, [router]);

  // 2) SNAPSHOTS (only if allowed)
  useEffect(() => {
    if (!allowed) return;

    // Disaster Cases
    const qCases = query(collection(db, "disasterCases"), orderBy("createdAt", "desc"));
    const unsubCases = onSnapshot(qCases, (snap) => {
      setCaseDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Volunteer Events
    const qEvents = query(collection(db, "volunteerEvents"), orderBy("createdAt", "desc"));
    const unsubEvents = onSnapshot(qEvents, (snap) => {
      setEventDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Volunteer Applications
    const qApps = query(collection(db, "volunteerApplications"));
    const unsubApps = onSnapshot(qApps, (snap) => {
      setAppDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // Volunteer Stats (optional but recommended)
    // Expected: volunteerStats/{uid} { totalHours, totalEvents, updatedAt }
    const qStats = query(collection(db, "volunteerStats"));
    const unsubStats = onSnapshot(
      qStats,
      (snap) => setStatDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setStatDocs([]) // if missing/permission, just fallback to empty
    );

    // Donations (optional)
    const qDon = query(collection(db, "donations"), orderBy("createdAt", "desc"));
    const unsubDon = onSnapshot(
      qDon,
      (snap) => setDonationDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setDonationDocs([])
    );

    return () => {
      unsubCases();
      unsubEvents();
      unsubApps();
      unsubStats();
      unsubDon();
    };
  }, [allowed]);

  // ---- METRICS ----
  const metrics = useMemo(() => {
    // CASES
    const caseTotal = caseDocs.length;
    const byCaseStatus: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const c of caseDocs) {
      const s = (c.status || "reported") as CaseStatus;
      byCaseStatus[s] = (byCaseStatus[s] || 0) + 1;

      const sev = (c.severity || "medium") as string;
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }
    const caseActive =
      (byCaseStatus["reported"] || 0) +
      (byCaseStatus["validated"] || 0) +
      (byCaseStatus["assigned"] || 0) +
      (byCaseStatus["in_progress"] || 0);
    const caseResolved = (byCaseStatus["resolved"] || 0) + (byCaseStatus["closed"] || 0);

    // EVENTS
    const eventTotal = eventDocs.length;
    const byEventStatus: Record<string, number> = {};
    for (const e of eventDocs) {
      const s = (e.status || "upcoming") as EventStatus;
      byEventStatus[s] = (byEventStatus[s] || 0) + 1;
    }
    const eventUpcoming = byEventStatus["upcoming"] || 0;
    const eventActive = byEventStatus["active"] || 0;
    const eventCompleted = byEventStatus["completed"] || 0;

    // VOLUNTEER APPS
    const appTotal = appDocs.length;
    const byAppStatus: Record<string, number> = {};
    for (const a of appDocs) {
      const s = (a.status || "pending") as VolunteerAppStatus;
      byAppStatus[s] = (byAppStatus[s] || 0) + 1;
    }
    const appPending = byAppStatus["pending"] || 0;
    const appApproved = byAppStatus["approved"] || 0;
    const appRejected = byAppStatus["rejected"] || 0;

    // STATS (global)
    let totalHours = 0;
    let totalEventsServed = 0;
    let activeVolunteers = 0;

    for (const st of statDocs) {
      const h = Number(st.totalHours || 0);
      const ev = Number(st.totalEvents || 0);
      if (ev > 0 || h > 0) activeVolunteers += 1;
      totalHours += h;
      totalEventsServed += ev;
    }

    // DONATIONS (optional)
    const donationTotal = donationDocs.length;
    const byDonStatus: Record<string, number> = {};
    let donationSum = 0;
    for (const d of donationDocs) {
      const s = (d.status || "pending") as string;
      byDonStatus[s] = (byDonStatus[s] || 0) + 1;
      donationSum += Number(d.amount || 0);
    }

    return {
      caseTotal,
      caseActive,
      caseResolved,
      byCaseStatus,
      bySeverity,

      eventTotal,
      eventUpcoming,
      eventActive,
      eventCompleted,

      appTotal,
      appPending,
      appApproved,
      appRejected,

      activeVolunteers,
      totalHours,
      totalEventsServed,

      donationTotal,
      donationSum,
      byDonStatus,
    };
  }, [caseDocs, eventDocs, appDocs, statDocs, donationDocs]);

  if (checkingRole) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Checking access…</Text>
      </View>
    );
  }

  if (!allowed) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Access Denied</Text>
        <Text style={styles.muted}>You must be admin/superadmin to view analytics.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Admin Analytics</Text>
          <Text style={styles.sub}>Role: {String(role)}</Text>
        </View>

        <View style={styles.headerBtns}>
          <TouchableOpacity style={styles.darkBtn} onPress={() => router.push("/(tabs)/admin-logs")}>
            <Text style={styles.darkBtnText}>Admin Logs</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* QUICK NAV */}
      <View style={styles.navRow}>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.push("/(admin)/admin-cases")}>
          <Text style={styles.navText}>Cases</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.push("/(admin)/admin-events")}>
          <Text style={styles.navText}>Events</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navBtn} onPress={() => router.push("/(tabs)/donation-list")}>
          <Text style={styles.navText}>Donations</Text>
        </TouchableOpacity>
        {/* ✅ NEW BUTTON - Admin Analytics */}
        <TouchableOpacity style={styles.navBtn} onPress={() => router.push("/(tabs)/admin-analytics")}>
          <Text style={styles.navText}>Admin Analytics</Text>
        </TouchableOpacity>
      </View>

      {/* KPI CARDS */}
      <View style={styles.grid}>
        <KpiCard title="Total Cases" value={metrics.caseTotal} hint={`Active: ${metrics.caseActive} • Resolved: ${metrics.caseResolved}`} />
        <KpiCard title="Volunteer Events" value={metrics.eventTotal} hint={`Upcoming: ${metrics.eventUpcoming} • Active: ${metrics.eventActive} • Done: ${metrics.eventCompleted}`} />
        <KpiCard title="Volunteer Applications" value={metrics.appTotal} hint={`Pending: ${metrics.appPending} • Approved: ${metrics.appApproved} • Rejected: ${metrics.appRejected}`} />
        <KpiCard title="Active Volunteers" value={metrics.activeVolunteers} hint={`(based on volunteerStats)`} />
        <KpiCard title="Total Hours Served" value={metrics.totalHours.toFixed(2)} hint={`Total events served: ${metrics.totalEventsServed}`} />
        <KpiCard title="Total Donations" value={metrics.donationTotal} hint={`Total amount: PHP ${metrics.donationSum.toFixed(2)}`} />
      </View>

      {/* BREAKDOWNS */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Case Status Breakdown</Text>
        <BreakdownRow label="REPORTED" value={metrics.byCaseStatus["reported"] || 0} />
        <BreakdownRow label="VALIDATED" value={metrics.byCaseStatus["validated"] || 0} />
        <BreakdownRow label="ASSIGNED" value={metrics.byCaseStatus["assigned"] || 0} />
        <BreakdownRow label="IN_PROGRESS" value={metrics.byCaseStatus["in_progress"] || 0} />
        <BreakdownRow label="RESOLVED" value={metrics.byCaseStatus["resolved"] || 0} />
        <BreakdownRow label="CLOSED" value={metrics.byCaseStatus["closed"] || 0} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Case Severity Breakdown</Text>
        <BreakdownRow label="CRITICAL" value={metrics.bySeverity["critical"] || 0} />
        <BreakdownRow label="HIGH" value={metrics.bySeverity["high"] || 0} />
        <BreakdownRow label="MEDIUM" value={metrics.bySeverity["medium"] || 0} />
        <BreakdownRow label="LOW" value={metrics.bySeverity["low"] || 0} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Donation Status Breakdown</Text>
        <BreakdownRow label="PENDING" value={metrics.byDonStatus["pending"] || 0} />
        <BreakdownRow label="RECEIVED" value={metrics.byDonStatus["received"] || 0} />
        <BreakdownRow label="DISTRIBUTED" value={metrics.byDonStatus["distributed"] || 0} />
        <BreakdownRow label="REJECTED" value={metrics.byDonStatus["rejected"] || 0} />
      </View>

      <Text style={styles.footerNote}>
        Note: "Active Volunteers" and "Total Hours Served" require the collection{" "}
        <Text style={{ fontWeight: "900" }}>volunteerStats</Text>. If it's empty, it will show 0.
      </Text>
    </ScrollView>
  );
}

function KpiCard({ title, value, hint }: { title: string; value: any; hint?: string }) {
  return (
    <View style={styles.kpi}>
      <Text style={styles.kpiTitle}>{title}</Text>
      <Text style={styles.kpiValue}>{String(value)}</Text>
      {hint ? <Text style={styles.kpiHint}>{hint}</Text> : null}
    </View>
  );
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: "#f4f7fb" },

  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 10 },
  muted: { color: "#64748b", textAlign: "center", fontWeight: "700" },
  denied: { fontSize: 18, fontWeight: "900", color: "#dc2626" },

  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginBottom: 12,
    gap: 10,
  },
  title: { fontSize: 22, fontWeight: "900", color: "#0f172a" },
  sub: { marginTop: 2, color: "#475569", fontWeight: "800" },
  headerBtns: { flexDirection: "row", gap: 10 },

  darkBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  darkBtnText: { color: "#fff", fontWeight: "900" },

  navRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 12 },
  navBtn: {
    flex: 1,
    minWidth: "30%",
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },
  navText: { color: "#fff", fontWeight: "900", fontSize: 13 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  kpi: {
    width: "48%",
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  kpiTitle: { color: "#334155", fontWeight: "900", marginBottom: 6 },
  kpiValue: { fontSize: 20, fontWeight: "900", color: "#0f172a" },
  kpiHint: { marginTop: 6, color: "#64748b", fontWeight: "700", lineHeight: 16 },

  section: {
    marginTop: 14,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: { fontWeight: "900", color: "#0f172a", marginBottom: 10 },

  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eef2f7",
  },
  rowLabel: { color: "#334155", fontWeight: "800" },
  rowValue: { color: "#0f172a", fontWeight: "900" },

  footerNote: { marginTop: 14, color: "#64748b", fontWeight: "700", lineHeight: 18 },
});