import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
    collection,
    doc,
    getDoc,
    limit,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../../lib/firebase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

type Severity = "low" | "medium" | "high" | "critical";
type CaseStatus =
  | "reported"
  | "validated"
  | "assigned"
  | "in_progress"
  | "resolved"
  | "closed";

type EventStatus = "upcoming" | "active" | "completed";

type Role = "user" | "volunteer" | "admin" | "superadmin" | string;

type DisasterCase = {
  id: string;
  title?: string;
  severity?: Severity;
  status?: CaseStatus;
  createdAt?: any;
  location?: string;
};

type VolunteerEvent = {
  id: string;
  title?: string;
  type?: "disaster" | "training";
  status?: EventStatus;
  capacity?: number;
  createdAt?: any;
  location?: string;
  date?: string;
};

export default function AdminDashboard() {
  const router = useRouter();

  const [role, setRole] = useState<Role | null>(null);
  const [checkingRole, setCheckingRole] = useState(true);

  const [cases, setCases] = useState<DisasterCase[]>([]);
  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [pendingVolunteerApps, setPendingVolunteerApps] = useState<number>(0);

  const isSuperAdmin = (role || "").toString().toLowerCase() === "superadmin";
  const isAdmin = (role || "").toString().toLowerCase() === "admin";
  const isAuthorized = isSuperAdmin || isAdmin;

  // 1) Role guard
  useEffect(() => {
    const run = async () => {
      try {
        const auth = getAuth();
        const user = auth.currentUser;

        if (!user) {
          router.replace("/login");
          return;
        }

        const snap = await getDoc(doc(db, "users", user.uid));
        const r = (snap.data()?.role || "").toString().trim().toLowerCase();
        setRole(r);
      } catch (e) {
        console.log("role check error:", e);
        setRole(null);
      } finally {
        setCheckingRole(false);
      }
    };
    run();
  }, [router]);

  // 2) Live: disaster cases
  useEffect(() => {
    if (!isAuthorized) return;

    const qCases = query(
      collection(db, "disasterCases"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(
      qCases,
      (snap) => {
        const list: DisasterCase[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setCases(list);
      },
      (err) => {
        console.log("cases snapshot error:", err);
      }
    );

    return () => unsub();
  }, [isAuthorized]);

  // 3) Live: volunteer events
  useEffect(() => {
    if (!isAuthorized) return;

    const qEvents = query(
      collection(db, "volunteerEvents"),
      orderBy("createdAt", "desc"),
      limit(200)
    );

    const unsub = onSnapshot(
      qEvents,
      (snap) => {
        const list: VolunteerEvent[] = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        }));
        setEvents(list);
      },
      (err) => {
        console.log("events snapshot error:", err);
      }
    );

    return () => unsub();
  }, [isAuthorized]);

  // 4) Live: pending volunteer applications count
  useEffect(() => {
    if (!isAuthorized) return;

    const qApps = query(
      collection(db, "volunteerApplications"),
      where("status", "==", "pending")
    );

    const unsub = onSnapshot(
      qApps,
      (snap) => setPendingVolunteerApps(snap.size),
      (err) => console.log("volunteerApplications snapshot error:", err)
    );

    return () => unsub();
  }, [isAuthorized]);

  const metrics = useMemo(() => {
    const byStatus: Record<string, number> = {
      reported: 0,
      validated: 0,
      assigned: 0,
      in_progress: 0,
      resolved: 0,
      closed: 0,
    };

    const bySeverity: Record<string, number> = {
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    };

    for (const c of cases) {
      const s = (c.status || "reported") as CaseStatus;
      const sev = (c.severity || "medium") as Severity;
      byStatus[s] = (byStatus[s] || 0) + 1;
      bySeverity[sev] = (bySeverity[sev] || 0) + 1;
    }

    const evByStatus: Record<string, number> = { upcoming: 0, active: 0, completed: 0 };
    for (const e of events) {
      const s = (e.status || "upcoming") as EventStatus;
      evByStatus[s] = (evByStatus[s] || 0) + 1;
    }

    const activeCases =
      byStatus.reported + byStatus.validated + byStatus.assigned + byStatus.in_progress;

    const criticalOpen =
      cases.filter(
        (c) => (c.severity || "medium") === "critical" && (c.status || "reported") !== "closed"
      ).length;

    const latestCases = cases.slice(0, 5);
    const latestEvents = events.slice(0, 5);

    return {
      byStatus,
      bySeverity,
      evByStatus,
      activeCases,
      criticalOpen,
      latestCases,
      latestEvents,
    };
  }, [cases, events]);

  if (checkingRole) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={styles.muted}>Loading dashboard…</Text>
      </View>
    );
  }

  if (!isAuthorized) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Admin Dashboard</Text>
        <Text style={styles.danger}>Access denied.</Text>
        <Text style={styles.muted}>
          Fix: set role = "admin" or "superadmin" in users/{`{uid}`}.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Command Center</Text>
          <Text style={styles.sub}>Role: {String(role)}</Text>
        </View>

        <TouchableOpacity
          style={styles.darkBtn}
          onPress={() => router.push("/(tabs)/admin-logs")}
        >
          <Text style={styles.darkBtnText}>Admin Logs</Text>
        </TouchableOpacity>
      </View>

      {/* QUICK ACTIONS */}
      <View style={styles.quickRow}>
        <QuickButton label="Cases" onPress={() => router.push("/(admin)/admin-cases")} />
        <QuickButton label="Events" onPress={() => router.push("/(admin)/admin-events")} />
        <QuickButton label="Donations" onPress={() => router.push({ pathname: "/donation-list" as any })} />
      </View>

      {/* KPI CARDS */}
      <View style={styles.grid}>
        <KpiCard label="Active Cases" value={metrics.activeCases} tone="blue" />
        <KpiCard label="Critical Open" value={metrics.criticalOpen} tone="red" />
        <KpiCard label="Pending Volunteer Apps" value={pendingVolunteerApps} tone="orange" />
        <KpiCard label="Active Events" value={metrics.evByStatus.active || 0} tone="green" />
      </View>

      {/* CASE STATUS */}
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Case Pipeline</Text>
        <View style={styles.rowWrap}>
          <SmallStat label="Reported" value={metrics.byStatus.reported} />
          <SmallStat label="Validated" value={metrics.byStatus.validated} />
          <SmallStat label="Assigned" value={metrics.byStatus.assigned} />
          <SmallStat label="In-Progress" value={metrics.byStatus.in_progress} />
          <SmallStat label="Resolved" value={metrics.byStatus.resolved} />
          <SmallStat label="Closed" value={metrics.byStatus.closed} />
        </View>
      </View>

      {/* SEVERITY */}
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Severity Overview</Text>
        <View style={styles.rowWrap}>
          <SmallStat label="Critical" value={metrics.bySeverity.critical} />
          <SmallStat label="High" value={metrics.bySeverity.high} />
          <SmallStat label="Medium" value={metrics.bySeverity.medium} />
          <SmallStat label="Low" value={metrics.bySeverity.low} />
        </View>
      </View>

      {/* EVENTS */}
      <View style={styles.block}>
        <Text style={styles.blockTitle}>Events Overview</Text>
        <View style={styles.rowWrap}>
          <SmallStat label="Upcoming" value={metrics.evByStatus.upcoming || 0} />
          <SmallStat label="Active" value={metrics.evByStatus.active || 0} />
          <SmallStat label="Completed" value={metrics.evByStatus.completed || 0} />
        </View>
      </View>

      {/* LATEST */}
      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <Text style={styles.blockTitle}>Latest Cases</Text>
          <TouchableOpacity onPress={() => router.push("/(admin)/admin-cases")}>
            <Text style={styles.link}>View all</Text>
          </TouchableOpacity>
        </View>

        {metrics.latestCases.length === 0 ? (
          <Text style={styles.muted}>No cases yet.</Text>
        ) : (
          metrics.latestCases.map((c) => (
            <View key={c.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{c.title || "Untitled Case"}</Text>
                <Text style={styles.itemMeta}>
                  {String(c.status || "reported").toUpperCase()} •{" "}
                  {String(c.severity || "medium").toUpperCase()}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>

      <View style={styles.block}>
        <View style={styles.blockHeaderRow}>
          <Text style={styles.blockTitle}>Latest Events</Text>
          <TouchableOpacity onPress={() => router.push("/(admin)/admin-events")}>
            <Text style={styles.link}>View all</Text>
          </TouchableOpacity>
        </View>

        {metrics.latestEvents.length === 0 ? (
          <Text style={styles.muted}>No events yet.</Text>
        ) : (
          metrics.latestEvents.map((e) => (
            <View key={e.id} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemTitle}>{e.title || "Untitled Event"}</Text>
                <Text style={styles.itemMeta}>
                  {String(e.status || "upcoming").toUpperCase()} •{" "}
                  {String(e.type || "disaster").toUpperCase()}
                </Text>
              </View>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

/* ---------- small components ---------- */

function QuickButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.quickBtn} onPress={onPress}>
      <Text style={styles.quickBtnText}>{label}</Text>
    </TouchableOpacity>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "blue" | "red" | "green" | "orange";
}) {
  const bg =
    tone === "blue"
      ? "#2563eb"
      : tone === "red"
      ? "#dc2626"
      : tone === "green"
      ? "#16a34a"
      : "#f59e0b";

  return (
    <View style={[styles.kpi, { backgroundColor: bg }]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue}>{value}</Text>
    </View>
  );
}

function SmallStat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

/* ---------- styles ---------- */

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, backgroundColor: "#f4f7fb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24, gap: 10 },

  topHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  title: { fontSize: 24, fontWeight: "900", color: "#0f172a" },
  sub: { color: "#64748b", fontWeight: "700", marginTop: 4 },

  muted: { color: "#64748b", textAlign: "center" },
  danger: { color: "#dc2626", fontWeight: "900", textAlign: "center" },

  darkBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  darkBtnText: { color: "#fff", fontWeight: "900" },

  quickRow: { flexDirection: "row", gap: 10, marginBottom: 14, flexWrap: "wrap" },
  quickBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
  },
  quickBtnText: { fontWeight: "900", color: "#0f172a" },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 },
  kpi: {
    width: (CARD_WIDTH - 10) / 2,
    borderRadius: 16,
    padding: 14,
  },
  kpiLabel: { color: "#fff", fontWeight: "900", opacity: 0.95 },
  kpiValue: { color: "#fff", fontWeight: "900", fontSize: 28, marginTop: 8 },

  block: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  blockHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  blockTitle: { fontWeight: "900", color: "#0f172a", fontSize: 15 },

  link: { fontWeight: "900", color: "#2563eb" },

  rowWrap: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  stat: {
    backgroundColor: "#f8fafc",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    minWidth: 110,
  },
  statLabel: { color: "#64748b", fontWeight: "900", fontSize: 12 },
  statValue: { color: "#0f172a", fontWeight: "900", fontSize: 20, marginTop: 6 },

  itemRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  itemTitle: { fontWeight: "900", color: "#0f172a" },
  itemMeta: { color: "#64748b", fontWeight: "700", marginTop: 3 },
});