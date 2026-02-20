import {
    collection,
    doc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../../lib/firebase";

interface AssistanceRequest {
  id: string;
  uid: string;
  fullName: string;
  phone?: string;
  location: string;
  description: string;
  status: "pending" | "approved" | "rejected";
}

export default function AdminRequests() {
  const [requests, setRequests] = useState<AssistanceRequest[]>([]);
  const [rejectReason, setRejectReason] = useState("");
  const [selectedRejectId, setSelectedRejectId] = useState<string | null>(null);

  useEffect(() => {
    loadRequests();
  }, []);

  const loadRequests = async () => {
    const q = query(
      collection(db, "assistanceRequests"),
      where("status", "==", "pending")
    );

    const snap = await getDocs(q);

        const list: AssistanceRequest[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<AssistanceRequest, "id">),
    }));

    setRequests(list);
  };

  const handleApprove = async (req: AssistanceRequest) => {
    try {
      // 1️⃣ Create assistance case
      const caseRef = doc(collection(db, "assistanceCases"));

      await setDoc(caseRef, {
        requestId: req.id,
        uid: req.uid,
        fullName: req.fullName,
        phone: req.phone || "",
        location: req.location,
        description: req.description,
        status: "active",
        createdAt: serverTimestamp(),
        assignedVolunteers: [],
      });

      // 2️⃣ Update original request
      await updateDoc(doc(db, "assistanceRequests", req.id), {
        status: "approved",
        approvedAt: serverTimestamp(),
      });

      Alert.alert("Approved", "Assistance case created.");
      loadRequests();
    } catch (err) {
      Alert.alert("Error", "Failed to approve request.");
    }
  };

  const handleReject = async (reqId: string) => {
    if (!rejectReason) {
      Alert.alert("Reason Required", "Please provide a rejection reason.");
      return;
    }

    try {
      await updateDoc(doc(db, "assistanceRequests", reqId), {
        status: "rejected",
        rejectedReason: rejectReason,
        rejectedAt: serverTimestamp(),
      });

      setRejectReason("");
      setSelectedRejectId(null);

      Alert.alert("Rejected", "Request rejected successfully.");
      loadRequests();
    } catch (err) {
      Alert.alert("Error", "Failed to reject request.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Pending Assistance Requests</Text>

      {requests.length === 0 && (
        <Text style={styles.empty}>No pending requests.</Text>
      )}

      {requests.map((req) => (
        <View key={req.id} style={styles.card}>
          <Text style={styles.name}>{req.fullName}</Text>
          <Text style={styles.meta}>Phone: {req.phone || "-"}</Text>
          <Text style={styles.meta}>Location: {req.location}</Text>
          <Text style={styles.meta}>Description: {req.description}</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.button, { backgroundColor: "#16a34a" }]}
              onPress={() => handleApprove(req)}
            >
              <Text style={styles.buttonText}>Approve</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, { backgroundColor: "#dc2626" }]}
              onPress={() => setSelectedRejectId(req.id)}
            >
              <Text style={styles.buttonText}>Reject</Text>
            </TouchableOpacity>
          </View>

          {selectedRejectId === req.id && (
            <>
              <TextInput
                placeholder="Rejection reason..."
                value={rejectReason}
                onChangeText={setRejectReason}
                style={styles.input}
              />

              <TouchableOpacity
                style={[styles.button, { backgroundColor: "#991b1b" }]}
                onPress={() => handleReject(req.id)}
              >
                <Text style={styles.buttonText}>Confirm Reject</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#f4f7fb",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 16,
  },
  empty: {
    color: "#64748b",
    textAlign: "center",
  },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  name: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },
  meta: {
    color: "#64748b",
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: {
    color: "#fff",
    fontWeight: "700",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    backgroundColor: "#fff",
  },
});

