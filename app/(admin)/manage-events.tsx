import {
    collection,
    doc,
    getDocs,
    onSnapshot,
    query,
    updateDoc,
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

type EventStatus = "upcoming" | "active" | "completed";
type EventType = "disaster" | "training";

interface VolunteerEvent {
  id: string;
  title: string;
  type: EventType;
  location: string;
  date: string;
  capacity: number;
  status: EventStatus;
}

export default function ManageEvents() {
  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    const q = query(collection(db, "volunteerEvents"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list: VolunteerEvent[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<VolunteerEvent, "id">),
      }));
      setEvents(list);
    });

    return unsub;
  }, []);

  useEffect(() => {
    const loadCounts = async () => {
      const map: Record<string, number> = {};
      for (const ev of events) {
        const snap = await getDocs(
          collection(db, "volunteerEvents", ev.id, "participants")
        );
        map[ev.id] = snap.size;
      }
      setCounts(map);
    };

    if (events.length) loadCounts();
  }, [events]);

  const setStatus = async (eventId: string, status: EventStatus) => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      await updateDoc(doc(db, "volunteerEvents", eventId), { status });
      Alert.alert("Updated", `Event status set to "${status}".`);
    } catch {
      Alert.alert("Error", "Failed to update event status.");
    }
  };

  const badgeStyle = (s: EventStatus) => {
    if (s === "upcoming") return { backgroundColor: "#6b7280" };
    if (s === "active") return { backgroundColor: "#2563eb" };
    return { backgroundColor: "#16a34a" };
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Manage Volunteer Events</Text>

      {events.map((ev) => {
        const joined = counts[ev.id] ?? 0;
        const slotsLeft = Math.max(ev.capacity - joined, 0);

        return (
          <View key={ev.id} style={styles.card}>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{ev.title}</Text>
                <Text style={styles.meta}>Type: {ev.type.toUpperCase()}</Text>
                <Text style={styles.meta}>Location: {ev.location}</Text>
                <Text style={styles.meta}>Date: {ev.date}</Text>
                <Text style={styles.meta}>
                  Capacity: {joined}/{ev.capacity} (Slots left: {slotsLeft})
                </Text>
              </View>

              <View style={[styles.badge, badgeStyle(ev.status)]}>
                <Text style={styles.badgeText}>{ev.status.toUpperCase()}</Text>
              </View>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.btn, styles.gray]}
                onPress={() => setStatus(ev.id, "upcoming")}
              >
                <Text style={styles.btnText}>Upcoming</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.blue]}
                onPress={() => setStatus(ev.id, "active")}
              >
                <Text style={styles.btnText}>Active</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btn, styles.green]}
                onPress={() => setStatus(ev.id, "completed")}
              >
                <Text style={styles.btnText}>Completed</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, backgroundColor: "#f4f7fb" },
  title: { fontSize: 22, fontWeight: "800", marginBottom: 16 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  topRow: { flexDirection: "row", gap: 10 },

  name: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
  meta: { color: "#64748b", marginBottom: 3 },

  badge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },
  badgeText: { color: "#fff", fontWeight: "800", fontSize: 12 },

  actions: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },

  btn: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10 },
  gray: { backgroundColor: "#111827" },
  blue: { backgroundColor: "#2563eb" },
  green: { backgroundColor: "#16a34a" },
  btnText: { color: "#fff", fontWeight: "800" },
});
