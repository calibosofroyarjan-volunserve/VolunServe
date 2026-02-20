import {
    collection,
    doc,
    onSnapshot,
    serverTimestamp,
    updateDoc
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

interface VolunteerApplication {
  uid: string;
  fullName: string;
  email: string;
  barangay: string;
  phone: string;
  skills: string[];
  availability: string;
  status: "pending" | "approved" | "rejected";
  rejectedReason?: string;
}

export default function VolunteerApproval() {
  const [applications, setApplications] = useState<VolunteerApplication[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "volunteerApplications"),
      (snapshot) => {
        const data = snapshot.docs.map((docSnap) => ({
          ...(docSnap.data() as VolunteerApplication),
        }));
        setApplications(data);
      }
    );

    return unsub;
  }, []);

  const approveVolunteer = async (uid: string) => {
    try {
      const admin = auth.currentUser;
      if (!admin) return;

      // Update application
      await updateDoc(doc(db, "volunteerApplications", uid), {
        status: "approved",
        reviewedAt: serverTimestamp(),
        reviewedBy: admin.uid,
      });

      // Update user role
      await updateDoc(doc(db, "users", uid), {
        role: "volunteer",
      });

      Alert.alert("Success", "Volunteer approved.");
    } catch (error) {
      Alert.alert("Error", "Failed to approve.");
    }
  };

  const openRejectModal = (uid: string) => {
    setSelectedUid(uid);
    setRejectReason("");
    setRejectOpen(true);
  };

  const rejectVolunteer = async () => {
    if (!selectedUid) return;

    if (rejectReason.trim().length < 5) {
      Alert.alert("Reason required", "Enter a clear rejection reason.");
      return;
    }

    try {
      const admin = auth.currentUser;
      if (!admin) return;

      await updateDoc(doc(db, "volunteerApplications", selectedUid), {
        status: "rejected",
        rejectedReason: rejectReason,
        reviewedAt: serverTimestamp(),
        reviewedBy: admin.uid,
      });

      setRejectOpen(false);
      setSelectedUid(null);

      Alert.alert("Rejected", "Volunteer application rejected.");
    } catch (error) {
      Alert.alert("Error", "Failed to reject.");
    }
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Volunteer Applications</Text>

        {applications
          .filter((app) => app.status === "pending")
          .map((app) => (
            <View key={app.uid} style={styles.card}>
              <Text style={styles.name}>{app.fullName}</Text>
              <Text style={styles.meta}>{app.email}</Text>
              <Text style={styles.meta}>Barangay: {app.barangay}</Text>
              <Text style={styles.meta}>Phone: {app.phone}</Text>
              <Text style={styles.meta}>
                Skills: {app.skills?.join(", ")}
              </Text>
              <Text style={styles.meta}>
                Availability: {app.availability}
              </Text>

              <View style={styles.actions}>
                <TouchableOpacity
                  style={[styles.button, styles.approve]}
                  onPress={() => approveVolunteer(app.uid)}
                >
                  <Text style={styles.buttonText}>Approve</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.button, styles.reject]}
                  onPress={() => openRejectModal(app.uid)}
                >
                  <Text style={styles.buttonText}>Reject</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
      </ScrollView>

      {/* Reject Modal */}
      <Modal visible={rejectOpen} transparent animationType="fade">
        <View style={styles.modalBg}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject Application</Text>

            <TextInput
              placeholder="Enter rejection reason"
              style={styles.input}
              multiline
              value={rejectReason}
              onChangeText={setRejectReason}
            />

            <TouchableOpacity
              style={[styles.button, styles.reject]}
              onPress={rejectVolunteer}
            >
              <Text style={styles.buttonText}>Confirm Reject</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.cancel]}
              onPress={() => setRejectOpen(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24 },
  title: { fontSize: 22, fontWeight: "700", marginBottom: 20 },

  card: {
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  name: { fontSize: 16, fontWeight: "700", marginBottom: 6 },
  meta: { color: "#6b7280", marginBottom: 4 },

  actions: { flexDirection: "row", marginTop: 10 },

  button: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    marginRight: 10,
  },

  approve: { backgroundColor: "#16a34a" },
  reject: { backgroundColor: "#dc2626" },
  cancel: { backgroundColor: "#6b7280", marginTop: 10 },

  buttonText: { color: "#fff", fontWeight: "700" },

  modalBg: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    padding: 20,
  },

  modalCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
  },

  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 12,
  },

  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    backgroundColor: "#fff",
    minHeight: 80,
  },
});
