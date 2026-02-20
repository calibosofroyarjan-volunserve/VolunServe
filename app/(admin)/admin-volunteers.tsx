import { useRouter } from "expo-router";
import {
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
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { auth, db } from "../../lib/firebase";

type ApplicationStatus = "pending" | "approved" | "rejected";

interface VolunteerApplication {
  id: string;
  fullName: string;
  email: string;
  barangay: string;
  phone: string;
  skills: string[];
  availability: string;
  status: ApplicationStatus;
  createdAt?: any;
  rejectedReason?: string;
}

const formatDate = (v: any) => {
  try {
    const d = v?.toDate?.() ? v.toDate() : null;
    if (!d) return "-";
    return d.toLocaleString();
  } catch {
    return "-";
  }
};

export default function AdminVolunteers() {
  const router = useRouter();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [applications, setApplications] = useState<VolunteerApplication[]>([]);

  const [rejectOpen, setRejectOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // 🔐 Role Protection
  useEffect(() => {
    const checkRole = async () => {
      if (!user) {
        router.replace("/login");
        return;
      }

      const snap = await getDoc(doc(db, "users", user.uid));
      const role = snap.data()?.role;

      if (role !== "admin" && role !== "superadmin") {
        router.replace("/");
        return;
      }

      setLoading(false);
    };

    checkRole();
  }, []);

  // 📦 Load Applications
  useEffect(() => {
    const q = query(
      collection(db, "volunteerApplications"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list: VolunteerApplication[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setApplications(list);
    });

    return unsub;
  }, []);

  const approve = async (id: string) => {
    await updateDoc(doc(db, "volunteerApplications", id), {
      status: "approved",
      approvedAt: serverTimestamp(),
      rejectedReason: null,
    });

    Alert.alert("Approved", "Volunteer approved.");
  };

  const openReject = (id: string) => {
    setSelectedId(id);
    setRejectReason("");
    setRejectOpen(true);
  };

  const reject = async () => {
    if (!selectedId) return;

    if (rejectReason.trim().length < 5) {
      Alert.alert("Reason required", "Please provide clear reason.");
      return;
    }

    await updateDoc(doc(db, "volunteerApplications", selectedId), {
      status: "rejected",
      rejectedReason: rejectReason,
      rejectedAt: serverTimestamp(),
    });

    setRejectOpen(false);
    setSelectedId(null);
    setRejectReason("");

    Alert.alert("Rejected", "Application rejected.");
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Text>Checking access...</Text>
      </View>
    );
  }

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Volunteer Applications</Text>

        {applications.map((app) => (
          <View key={app.id} style={styles.card}>
            <Text style={styles.name}>{app.fullName}</Text>
            <Text style={styles.meta}>{app.email}</Text>
            <Text style={styles.meta}>Barangay: {app.barangay}</Text>
            <Text style={styles.meta}>Phone: {app.phone}</Text>
            <Text style={styles.meta}>
              Skills: {app.skills?.join(", ") || "-"}
            </Text>
            <Text style={styles.meta}>
              Availability: {app.availability}
            </Text>
            <Text style={styles.meta}>
              Applied: {formatDate(app.createdAt)}
            </Text>

            <View style={styles.statusRow}>
              <View style={[styles.badge, badgeColor(app.status)]}>
                <Text style={styles.badgeText}>
                  {app.status.toUpperCase()}
                </Text>
              </View>
            </View>

            {app.status === "pending" && (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.button, styles.approveBtn]}
                  onPress={() => approve(app.id)}
                >
                  <Text style={styles.buttonText}>Approve</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.rejectBtn]}
                  onPress={() => openReject(app.id)}
                >
                  <Text style={styles.buttonText}>Reject</Text>
                </TouchableOpacity>
              </View>
            )}

            {app.status === "rejected" && app.rejectedReason && (
              <Text style={styles.rejectText}>
                Reason: {app.rejectedReason}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>

      {/* Reject Modal */}
      <Modal visible={rejectOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Application</Text>

            <TextInput
              style={styles.input}
              placeholder="Enter reason..."
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
            />

            <View style={styles.modalRow}>
              <TouchableOpacity
                style={[styles.button, styles.rejectBtn]}
                onPress={reject}
              >
                <Text style={styles.buttonText}>Confirm</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.button, styles.cancelBtn]}
                onPress={() => setRejectOpen(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const badgeColor = (status: ApplicationStatus) => {
  if (status === "pending") return { backgroundColor: "#f59e0b" };
  if (status === "approved") return { backgroundColor: "#16a34a" };
  return { backgroundColor: "#dc2626" };
};

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f4f7fb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },

  title: { fontSize: 22, fontWeight: "800", marginBottom: 16 },

  card: {
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  name: { fontWeight: "800", fontSize: 16 },
  meta: { color: "#64748b", marginTop: 2 },

  statusRow: { marginTop: 8 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 11 },

  actionRow: { flexDirection: "row", gap: 10, marginTop: 10 },

  button: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: "center",
  },

  approveBtn: { backgroundColor: "#16a34a" },
  rejectBtn: { backgroundColor: "#dc2626" },
  cancelBtn: { backgroundColor: "#6b7280" },

  buttonText: { color: "#fff", fontWeight: "700" },

  rejectText: { color: "#dc2626", marginTop: 8, fontWeight: "600" },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 10,
  },

  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },

  modalRow: { flexDirection: "row", gap: 10 },
});
