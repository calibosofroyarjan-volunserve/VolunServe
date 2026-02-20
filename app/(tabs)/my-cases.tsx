import {
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
import { auth, db } from "../../lib/firebase";

interface AssistanceCase {
  id: string;
  fullName: string;
  location: string;
  description: string;
  status: "active" | "completed";
  assignedVolunteers?: any[];
}

export default function MyCases() {
  const [cases, setCases] = useState<AssistanceCase[]>([]);
  const user = auth.currentUser;

  useEffect(() => {
    loadCases();
  }, []);

  const loadCases = async () => {
    if (!user) return;

    const q = query(
      collection(db, "assistanceCases"),
      where("status", "==", "active")
    );

    const snap = await getDocs(q);

    const list: AssistanceCase[] = snap.docs
      .map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AssistanceCase, "id">),
      }))
      .filter((c) =>
        c.assignedVolunteers?.some((v: any) => v.uid === user.uid)
      );

    setCases(list);
  };

  const markVolunteerComplete = async (caseId: string) => {
    if (!user) return;

    try {
      await updateDoc(doc(db, "assistanceCases", caseId), {
        [`volunteerCompletion.${user.uid}`]: {
          completedAt: serverTimestamp(),
        },
      });

      Alert.alert("Completed", "You marked your assistance complete.");
      loadCases();
    } catch (err) {
      Alert.alert("Error", "Failed to update completion.");
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Assigned Disaster Cases</Text>

      {cases.length === 0 && (
        <Text style={styles.empty}>No assigned cases.</Text>
      )}

      {cases.map((c) => (
        <View key={c.id} style={styles.card}>
          <Text style={styles.name}>{c.fullName}</Text>
          <Text style={styles.meta}>Location: {c.location}</Text>
          <Text style={styles.meta}>Description: {c.description}</Text>

          <TouchableOpacity
            style={styles.button}
            onPress={() => markVolunteerComplete(c.id)}
          >
            <Text style={styles.buttonText}>
              Mark My Assistance Completed
            </Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#f4f7fb" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 16 },
  empty: { color: "#64748b", textAlign: "center" },
  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  name: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  meta: { color: "#64748b", marginBottom: 4 },
  button: {
    marginTop: 12,
    backgroundColor: "#2563eb",
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonText: { color: "#fff", fontWeight: "700" },
});
