import {
    arrayUnion,
    collection,
    doc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../../lib/firebase";

interface AssistanceCase {
  id: string;
  fullName: string;
  phone?: string;
  location: string;
  description: string;
  status: "active" | "completed";
  assignedVolunteers?: any[];
}

interface Volunteer {
  uid: string;
  fullName: string;
}

export default function AdminCases() {
  const [cases, setCases] = useState<AssistanceCase[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);

  useEffect(() => {
    loadCases();
    loadVolunteers();
  }, []);

  const loadCases = async () => {
    const q = query(
      collection(db, "assistanceCases"),
      where("status", "==", "active")
    );

    const snap = await getDocs(q);

    const list: AssistanceCase[] = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as Omit<AssistanceCase, "id">),
    }));

    setCases(list);
  };

  const loadVolunteers = async () => {
    const q = query(
      collection(db, "volunteerApplications"),
      where("status", "==", "approved")
    );

    const snap = await getDocs(q);

    const list: Volunteer[] = snap.docs.map((d) => ({
      uid: d.id,
      fullName: d.data().fullName,
    }));

    setVolunteers(list);
  };

  const assignVolunteer = async (caseId: string, volunteer: Volunteer) => {
    try {
      await updateDoc(doc(db, "assistanceCases", caseId), {
        assignedVolunteers: arrayUnion({
          uid: volunteer.uid,
          fullName: volunteer.fullName,
          assignedAt: serverTimestamp(),
        }),
      });

      Alert.alert("Assigned", "Volunteer assigned successfully.");
      loadCases();
    } catch (err) {
      Alert.alert("Error", "Failed to assign volunteer.");
    }
  };

  const handleComplete = async (caseId: string) => {
    await updateDoc(doc(db, "assistanceCases", caseId), {
      status: "completed",
      completedAt: serverTimestamp(),
    });

    Alert.alert("Completed", "Case marked completed.");
    loadCases();
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Active Disaster Cases</Text>

      {cases.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.name}>{c.fullName}</Text>
          <Text style={styles.meta}>Location: {c.location}</Text>
          <Text style={styles.meta}>Description: {c.description}</Text>

          <Text style={styles.section}>Assigned Volunteers:</Text>
          {c.assignedVolunteers?.length ? (
            c.assignedVolunteers.map((v, index) => (
              <Text key={index} style={styles.meta}>
                • {v.fullName}
              </Text>
            ))
          ) : (
            <Text style={styles.meta}>None assigned yet</Text>
          )}

          <Text style={styles.section}>Assign Volunteer:</Text>
          {volunteers.map((v) => (
            <TouchableOpacity
              key={v.uid}
              style={styles.assignButton}
              onPress={() => assignVolunteer(c.id, v)}
            >
              <Text style={styles.buttonText}>{v.fullName}</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.completeButton}
            onPress={() => handleComplete(c.id)}
          >
            <Text style={styles.buttonText}>Mark Completed</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#f4f7fb" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 16 },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  name: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  meta: { color: "#64748b", marginBottom: 4 },
  section: { marginTop: 10, fontWeight: "700" },
  assignButton: {
    marginTop: 6,
    backgroundColor: "#2563eb",
    padding: 8,
    borderRadius: 8,
  },
  completeButton: {
    marginTop: 12,
    backgroundColor: "#16a34a",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
