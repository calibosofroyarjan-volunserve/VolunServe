import { useRouter } from "expo-router";
import { getAuth } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { db } from "../../lib/firebase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

interface Donation {
  id: string;
  donorName: string;
  amount: number;
  barangay: string;
  status: string;
  refNumber?: string;
  rejectionReason?: string;
}

type LogAction = "verified" | "rejected" | "distributed";

export default function DonationList() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [loadingRole, setLoadingRole] = useState(true);

  const [reports, setReports] = useState<Record<string, any>>({});
  const [showLogs, setShowLogs] = useState<Record<string, boolean>>({});
  const [donationLogs, setDonationLogs] = useState<Record<string, any[]>>({});

  const router = useRouter();

  // 🔐 CHECK ROLE
  useEffect(() => {
    const checkRole = async () => {
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

    checkRole();
  }, []);

  const isSuperAdmin = role === "superadmin";
  const isAdmin = role === "admin";
  const isAuthorized = isSuperAdmin || isAdmin;

  // 📦 FETCH DONATIONS
  useEffect(() => {
    if (!isAuthorized) return;

    const q = query(collection(db, "donations"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs: Donation[] = snapshot.docs.map((docSnap) => {
        const data: any = docSnap.data();
        return {
          id: docSnap.id,
          donorName: data.donorName || "Anonymous",
          amount: data.amount || 0,
          barangay: data.barangay || "SJDM",
          status: data.status || "pending",
          refNumber: data.refNumber || docSnap.id, // if you used refNumber as doc id
          rejectionReason: data.rejectionReason || "",
        };
      });

      setDonations(docs);
    });

    return () => unsubscribe();
  }, [isAuthorized]);

  // ✅ Save action log (subcollection)
  const logAction = async (
    donation: Donation,
    action: LogAction,
    note: string,
    statusAfter: string
  ) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    // get admin name (optional)
    let actorName = "Admin";
    try {
      const u = await getDoc(doc(db, "users", user.uid));
      actorName = u.data()?.fullName || actorName;
    } catch {}

    await addDoc(collection(db, "donations", donation.id, "logs"), {
      donationId: donation.id,
      action,
      note: note || "",
      statusAfter,

      // snapshot donation info for easier display
      donorName: donation.donorName,
      barangay: donation.barangay,
      amount: donation.amount,
      refNumber: donation.refNumber || donation.id,

      actorUid: user.uid,
      actorRole: role || "",
      actorName,

      createdAt: serverTimestamp(),
    });
  };

  // 🔥 VERIFY (Superadmin Only)
  const verifyDonation = async (donation: Donation) => {
    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      await updateDoc(doc(db, "donations", donation.id), {
        status: "received",
        verifiedBy: user.uid,
        verifiedAt: serverTimestamp(),
      });

      await logAction(donation, "verified", "Donation verified as received.", "received");
      Alert.alert("Success", "Donation Verified");
    } catch {
      Alert.alert("Error", "Failed to verify donation.");
    }
  };

  // ❌ REJECT (Superadmin Only) with reason
  const rejectDonation = async (donation: Donation) => {
    const reason = reports[donation.id]?.rejectReason?.trim();
    if (!reason) {
      Alert.alert("Required", "Please enter a rejection reason first.");
      return;
    }

    try {
      const auth = getAuth();
      const user = auth.currentUser;
      if (!user) return;

      await updateDoc(doc(db, "donations", donation.id), {
        status: "rejected",
        rejectedBy: user.uid,
        rejectedAt: serverTimestamp(),
        rejectionReason: reason,
      });

      await logAction(donation, "rejected", reason, "rejected");

      Alert.alert("Rejected", "Donation rejected successfully.");
      setReports((p) => ({ ...p, [donation.id]: { ...p[donation.id], rejectReason: "" } }));
    } catch {
      Alert.alert("Error", "Failed to reject donation.");
    }
  };

  // 📦 DISTRIBUTE (Admin + Superadmin)
  const distributeDonation = async (donation: Donation) => {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) return;

    const report = reports[donation.id];

    if (!report?.beneficiary || !report?.families) {
      Alert.alert("Error", "Fill beneficiary and families helped");
      return;
    }

    try {
      await updateDoc(doc(db, "donations", donation.id), {
        status: "distributed",
        beneficiary: report.beneficiary,
        familiesHelped: Number(report.families),
        distributionNote: report.note || "",
        distributedBy: user.uid,
        distributedAt: serverTimestamp(),
      });

      await logAction(
        donation,
        "distributed",
        `Distributed to: ${report.beneficiary} | Families helped: ${report.families}${report.note ? " | Note: " + report.note : ""}`,
        "distributed"
      );

      Alert.alert("Success", "Donation Distributed");

      setReports((prev) => ({
        ...prev,
        [donation.id]: { beneficiary: "", families: "", note: "", rejectReason: "" },
      }));
    } catch {
      Alert.alert("Error", "Failed to distribute donation.");
    }
  };

  // 👁️ View logs per donation
  const toggleLogs = (donation: Donation) => {
    const next = !showLogs[donation.id];
    setShowLogs((p) => ({ ...p, [donation.id]: next }));

    if (next && !donationLogs[donation.id]) {
      const q = query(collection(db, "donations", donation.id, "logs"), orderBy("createdAt", "desc"));
      const unsub = onSnapshot(q, (snap) => {
        setDonationLogs((prev) => ({
          ...prev,
          [donation.id]: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
        }));
      });

      // NOTE: simple unsubscribe after first toggle off not implemented to keep it simple.
      // If you want, I can optimize it later.
    }
  };

  if (loadingRole) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
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
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.title}>Donation Administration</Text>
          <Text style={{ color: "#64748b", fontWeight: "700" }}>Role: {role}</Text>
        </View>

        {/* ✅ Global Logs Button */}
        <TouchableOpacity
          style={styles.globalLogsBtn}
          onPress={() => router.push("/(tabs)/admin-logs")}
        >
          <Text style={{ color: "#fff", fontWeight: "800" }}>Admin Logs</Text>
        </TouchableOpacity>
      </View>

      {donations.map((d) => (
        <View key={d.id} style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.name}>{d.donorName}</Text>
            <View
              style={[
                styles.statusPill,
                d.status === "pending"
                  ? { backgroundColor: "#6b7280" }
                  : d.status === "received"
                  ? { backgroundColor: "#2563eb" }
                  : d.status === "distributed"
                  ? { backgroundColor: "#16a34a" }
                  : { backgroundColor: "#dc2626" },
              ]}
            >
              <Text style={styles.statusText}>{d.status.toUpperCase()}</Text>
            </View>
          </View>

          <Text style={styles.meta}>Barangay: {d.barangay}</Text>
          <Text style={styles.meta}>Ref: {d.refNumber}</Text>
          <Text style={styles.amount}>PHP {Number(d.amount).toFixed(2)}</Text>

          {/* VERIFY + REJECT for Superadmin (pending only) */}
          {isSuperAdmin && d.status === "pending" && (
            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.verify} onPress={() => verifyDonation(d)}>
                <Text style={styles.btnText}>Verify</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.reject} onPress={() => rejectDonation(d)}>
                <Text style={styles.btnText}>Reject</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.logsBtn} onPress={() => toggleLogs(d)}>
                <Text style={styles.btnText}>{showLogs[d.id] ? "Hide Logs" : "View Logs"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* DISTRIBUTION FORM for received */}
          {d.status === "received" && (
            <View style={{ marginTop: 10 }}>
              <TextInput
                placeholder="Beneficiary (e.g. Brgy. Francisco Homes Phase 2 Residents)"
                style={styles.input}
                value={reports[d.id]?.beneficiary || ""}
                onChangeText={(t) =>
                  setReports((p) => ({
                    ...p,
                    [d.id]: { ...p[d.id], beneficiary: t },
                  }))
                }
              />
              <TextInput
                placeholder="Families helped (e.g. 20)"
                style={styles.input}
                keyboardType="numeric"
                value={reports[d.id]?.families || ""}
                onChangeText={(t) =>
                  setReports((p) => ({
                    ...p,
                    [d.id]: { ...p[d.id], families: t },
                  }))
                }
              />
              <TextInput
                placeholder="Optional note (e.g. Relief packs + bottled water)"
                style={styles.input}
                value={reports[d.id]?.note || ""}
                onChangeText={(t) =>
                  setReports((p) => ({
                    ...p,
                    [d.id]: { ...p[d.id], note: t },
                  }))
                }
              />

              <TouchableOpacity style={styles.distribute} onPress={() => distributeDonation(d)}>
                <Text style={styles.btnText}>Submit Distribution</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.logsBtn, { marginTop: 8 }]} onPress={() => toggleLogs(d)}>
                <Text style={styles.btnText}>{showLogs[d.id] ? "Hide Logs" : "View Logs"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* REJECT reason display */}
          {d.status === "rejected" && (
            <View style={styles.rejectBox}>
              <Text style={styles.rejectTitle}>Rejected Reason</Text>
              <Text style={styles.rejectText}>{d.rejectionReason || "-"}</Text>

              <TouchableOpacity style={[styles.logsBtn, { marginTop: 10 }]} onPress={() => toggleLogs(d)}>
                <Text style={styles.btnText}>{showLogs[d.id] ? "Hide Logs" : "View Logs"}</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ✅ Reject reason input (only shows while pending for superadmin) */}
          {isSuperAdmin && d.status === "pending" && (
            <View style={{ marginTop: 10 }}>
              <TextInput
                placeholder="Rejection reason (required if rejecting)"
                style={styles.input}
                value={reports[d.id]?.rejectReason || ""}
                onChangeText={(t) =>
                  setReports((p) => ({
                    ...p,
                    [d.id]: { ...p[d.id], rejectReason: t },
                  }))
                }
              />
            </View>
          )}

          {/* Logs panel */}
          {showLogs[d.id] && (
            <View style={styles.logsPanel}>
              <Text style={styles.logsTitle}>Action Logs</Text>
              {donationLogs[d.id]?.length ? (
                donationLogs[d.id].map((l: any) => (
                  <View key={l.id} style={styles.logItem}>
                    <Text style={{ fontWeight: "800" }}>
                      {String(l.action || "").toUpperCase()}
                    </Text>
                    {l.note ? <Text style={{ color: "#334155" }}>{l.note}</Text> : null}
                  </View>
                ))
              ) : (
                <Text style={{ color: "#64748b" }}>No logs yet.</Text>
              )}
            </View>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f4f7fb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "900" },
  denied: { fontSize: 20, fontWeight: "bold", color: "red" },

  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 15 },
  globalLogsBtn: { backgroundColor: "#111827", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },

  card: { width: "100%", backgroundColor: "#fff", padding: 16, borderRadius: 18, marginBottom: 12, elevation: 2 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontWeight: "900", fontSize: 16 },
  meta: { color: "#334155", fontWeight: "600", marginTop: 2 },
  amount: { fontWeight: "900", color: "#16a34a", marginTop: 8, fontSize: 18 },

  statusPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  statusText: { color: "#fff", fontWeight: "900", fontSize: 12 },

  btnRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  verify: { backgroundColor: "#2563eb", padding: 10, borderRadius: 12, minWidth: 90 },
  reject: { backgroundColor: "#dc2626", padding: 10, borderRadius: 12, minWidth: 90 },
  logsBtn: { backgroundColor: "#111827", padding: 10, borderRadius: 12, minWidth: 110 },
  distribute: { backgroundColor: "#16a34a", padding: 12, borderRadius: 12, marginTop: 6 },

  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, padding: 10, marginBottom: 8, backgroundColor: "#fff" },
  btnText: { color: "#fff", fontWeight: "800", textAlign: "center" },

  rejectBox: { marginTop: 12, backgroundColor: "#fff1f2", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#fecdd3" },
  rejectTitle: { fontWeight: "900", color: "#991b1b", marginBottom: 4 },
  rejectText: { color: "#7f1d1d", fontWeight: "700" },

  logsPanel: { marginTop: 12, backgroundColor: "#f8fafc", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  logsTitle: { fontWeight: "900", marginBottom: 8, color: "#0f172a" },
  logItem: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "#e2e8f0" },
});
