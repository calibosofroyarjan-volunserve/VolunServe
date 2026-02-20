import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
    collectionGroup,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    Timestamp,
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

type LogAction = "verified" | "rejected" | "distributed";

type LogItem = {
  id: string;
  donationId: string;
  action: LogAction;
  note?: string;

  // snapshots (to show without extra reads)
  donorName?: string;
  barangay?: string;
  amount?: number;
  refNumber?: string;
  statusAfter?: string;

  actorUid?: string;
  actorRole?: string;
  actorName?: string;

  createdAt?: Timestamp;
};

const formatDate = (ts?: Timestamp) => {
  if (!ts) return "-";
  const d = ts.toDate();
  return d.toLocaleString();
};

const badgeStyle = (action: LogAction) => {
  if (action === "verified") return { backgroundColor: "#2563eb" };
  if (action === "rejected") return { backgroundColor: "#dc2626" };
  return { backgroundColor: "#16a34a" };
};

export default function AdminLogs() {
  const router = useRouter();
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [logs, setLogs] = useState<LogItem[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

  const [filter, setFilter] = useState<"all" | LogAction>("all");

  const isAuthorized = role === "admin" || role === "superadmin";

  // 🔐 Role check
  useEffect(() => {
    const run = async () => {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) {
        router.replace("/login");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const userRole = snap.data()?.role?.trim().toLowerCase() || "";
      setRole(userRole);
      setLoadingRole(false);
    };

    run();
  }, []);

  // 📜 Global logs feed
  useEffect(() => {
    if (!isAuthorized) return;

    // logs are stored under: donations/{donationId}/logs/{logId}
    // so we read them via collectionGroup("logs")
    const q = query(collectionGroup(db, "logs"), orderBy("createdAt", "desc"));

    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: LogItem[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            donationId: data.donationId || "",
            action: data.action,
            note: data.note || "",
            donorName: data.donorName,
            barangay: data.barangay,
            amount: data.amount,
            refNumber: data.refNumber,
            statusAfter: data.statusAfter,
            actorUid: data.actorUid,
            actorRole: data.actorRole,
            actorName: data.actorName,
            createdAt: data.createdAt,
          };
        });

        setLogs(list);
        setLoadingLogs(false);
      },
      () => setLoadingLogs(false)
    );

    return () => unsub();
  }, [isAuthorized]);

  const visible = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => l.action === filter);
  }, [logs, filter]);

  if (loadingRole) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 10 }}>Loading...</Text>
      </View>
    );
  }

  if (!isAuthorized) {
    return (
      <View style={styles.center}>
        <Text style={styles.denied}>Access Denied</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Admin Activity Logs</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: "#fff", fontWeight: "700" }}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Global timeline of verification, rejection, and distribution actions.
      </Text>

      {/* Filter chips */}
      <View style={styles.filters}>
        <Chip active={filter === "all"} label="All" onPress={() => setFilter("all")} />
        <Chip
          active={filter === "verified"}
          label="Verified"
          onPress={() => setFilter("verified")}
        />
        <Chip
          active={filter === "rejected"}
          label="Rejected"
          onPress={() => setFilter("rejected")}
        />
        <Chip
          active={filter === "distributed"}
          label="Distributed"
          onPress={() => setFilter("distributed")}
        />
      </View>

      {loadingLogs && (
        <View style={{ marginTop: 20 }}>
          <ActivityIndicator size="large" />
          <Text style={{ marginTop: 10, textAlign: "center" }}>Loading logs...</Text>
        </View>
      )}

      {!loadingLogs && visible.length === 0 && (
        <Text style={{ marginTop: 20, color: "#64748b" }}>No logs yet.</Text>
      )}

      {visible.map((l) => (
        <View key={`${l.donationId}_${l.id}`} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.ref}>Ref: {l.refNumber || "-"}</Text>
            <View style={[styles.badge, badgeStyle(l.action)]}>
              <Text style={styles.badgeText}>{String(l.action).toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.amount}>PHP {Number(l.amount || 0).toFixed(2)}</Text>
          <Text style={styles.meta}>Barangay: {l.barangay || "-"}</Text>
          <Text style={styles.meta}>Donor: {l.donorName || "-"}</Text>

          <View style={styles.hr} />

          <Text style={styles.meta}>
            By: {l.actorName || "Admin"} ({l.actorRole || "-"})
          </Text>
          <Text style={styles.meta}>Date: {formatDate(l.createdAt)}</Text>

          {l.note ? (
            <View style={styles.noteBox}>
              <Text style={styles.noteTitle}>Note</Text>
              <Text style={styles.noteText}>{l.note}</Text>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        active ? { backgroundColor: "#0f172a" } : { backgroundColor: "#e2e8f0" },
      ]}
    >
      <Text style={[styles.chipText, active ? { color: "#fff" } : { color: "#0f172a" }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40, backgroundColor: "#f4f7fb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  denied: { fontSize: 20, fontWeight: "800", color: "#dc2626" },

  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "900" },
  backBtn: { backgroundColor: "#111827", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },

  subtitle: { color: "#64748b", marginTop: 8, marginBottom: 14 },

  filters: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  chipText: { fontWeight: "700", fontSize: 12 },

  card: { backgroundColor: "#fff", borderRadius: 18, padding: 16, marginBottom: 12, elevation: 2 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { fontWeight: "800", color: "#0f172a" },
  badge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999 },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  amount: { marginTop: 6, fontSize: 18, fontWeight: "900", color: "#16a34a" },
  meta: { marginTop: 2, color: "#334155", fontWeight: "600" },

  hr: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 10 },

  noteBox: { marginTop: 10, backgroundColor: "#f8fafc", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  noteTitle: { fontWeight: "900", marginBottom: 4, color: "#0f172a" },
  noteText: { color: "#0f172a" },
});
