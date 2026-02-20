import { doc, onSnapshot } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { auth, db } from "../../lib/firebase";

type Stats = {
  totalHours: number;
  totalEventsCompleted: number;
  totalCheckIns: number;
};

export default function VolunteerImpact() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const ref = doc(db, "volunteerStats", user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) setStats(snap.data() as any);
        else setStats({ totalHours: 0, totalEventsCompleted: 0, totalCheckIns: 0 });
        setLoading(false);
      },
      () => setLoading(false)
    );

    return () => unsub();
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>My Volunteer Impact</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Total Hours</Text>
        <Text style={styles.value}>{Number(stats?.totalHours || 0).toFixed(2)} hrs</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Events Completed</Text>
        <Text style={styles.value}>{stats?.totalEventsCompleted || 0}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Total Check-ins</Text>
        <Text style={styles.value}>{stats?.totalCheckIns || 0}</Text>
      </View>

      <Text style={styles.note}>
        Hours are automatically computed from your check-in and check-out records.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  container: { flex: 1, padding: 20, backgroundColor: "#f4f7fb" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 16 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
  },
  label: { color: "#64748b", fontWeight: "700", fontSize: 12 },
  value: { fontSize: 20, fontWeight: "900", marginTop: 6, color: "#0f172a" },
  note: { marginTop: 10, color: "#64748b" },
});
