import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { auth, db } from "../../lib/firebase";

interface VolunteerEvent {
  id: string;
  title: string;
  location: string;
  date: string;
  capacity: number;
}

interface Participant {
  id: string;
  fullName: string;
  barangay: string;
  joinedAt?: any;
  checkedInAt?: any;
  checkedOutAt?: any;
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

export default function AdminAttendance() {
  const router = useRouter();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<VolunteerEvent[]>([]);
  const [participantsByEvent, setParticipantsByEvent] =
    useState<Record<string, Participant[]>>({});

  // 🔐 Protect Route
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

      loadData();
    };

    checkRole();
  }, []);

  const loadData = async () => {
    const eventsSnap = await getDocs(collection(db, "volunteerEvents"));

    const eventsList: VolunteerEvent[] = [];
    const participantMap: Record<string, Participant[]> = {};

    for (const ev of eventsSnap.docs) {
      const eventData = ev.data();
      eventsList.push({
        id: ev.id,
        title: eventData.title,
        location: eventData.location,
        date: eventData.date,
        capacity: eventData.capacity,
      });

      const participantsSnap = await getDocs(
        collection(db, "volunteerEvents", ev.id, "participants")
      );

      participantMap[ev.id] = participantsSnap.docs.map((p) => {
        const data = p.data();
        return {
          id: p.id,
          fullName: data.fullName,
          barangay: data.barangay,
          joinedAt: data.joinedAt,
          checkedInAt: data.checkedInAt,
          checkedOutAt: data.checkedOutAt,
        };
      });
    }

    setEvents(eventsList);
    setParticipantsByEvent(participantMap);
    setLoading(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Volunteer Attendance Overview</Text>

      {events.map((ev) => {
                const participants = participantsByEvent[ev.id] || [];

        const totalJoined = participants.length;
        const totalCheckedIn = participants.filter(
          (p) => p.checkedInAt && !p.checkedOutAt
        ).length;
        const totalCompleted = participants.filter(
          (p) => p.checkedOutAt
        ).length;

        return (
          <View key={ev.id} style={styles.card}>
            <Text style={styles.eventTitle}>{ev.title}</Text>
            <Text style={styles.meta}>Location: {ev.location}</Text>
            <Text style={styles.meta}>Date: {ev.date}</Text>

            <View style={styles.statsRow}>
              <Text style={styles.stat}>Joined: {totalJoined}</Text>
              <Text style={styles.statBlue}>
                Checked-In: {totalCheckedIn}
              </Text>
              <Text style={styles.statGreen}>
                Completed: {totalCompleted}
              </Text>
            </View>

            {participants.map((p) => (
              <View key={p.id} style={styles.participantCard}>
                <Text style={styles.name}>{p.fullName}</Text>
                <Text style={styles.meta}>Barangay: {p.barangay}</Text>

                <Text style={styles.meta}>
                  Joined: {formatDate(p.joinedAt)}
                </Text>
                <Text style={styles.meta}>
                  Check-in: {formatDate(p.checkedInAt)}
                </Text>
                <Text style={styles.meta}>
                  Check-out: {formatDate(p.checkedOutAt)}
                </Text>

                <View style={[styles.badge, getBadgeColor(p)]}>
                  <Text style={styles.badgeText}>
                    {getBadgeText(p)}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        );
      })}
    </ScrollView>
  );
}

const getBadgeText = (p: Participant) => {
  if (!p.checkedInAt) return "NOT CHECKED-IN";
  if (p.checkedInAt && !p.checkedOutAt) return "CHECKED-IN";
  return "COMPLETED";
};

const getBadgeColor = (p: Participant) => {
  if (!p.checkedInAt)
    return { backgroundColor: "#6b7280" };
  if (p.checkedInAt && !p.checkedOutAt)
    return { backgroundColor: "#2563eb" };
  return { backgroundColor: "#16a34a" };
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: "#f4f7fb",
  },

  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 20,
  },

  card: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  eventTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 6,
  },

  meta: {
    color: "#64748b",
    marginBottom: 4,
  },

  statsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 10,
    marginBottom: 12,
  },

  stat: {
    fontWeight: "700",
  },

  statBlue: {
    fontWeight: "700",
    color: "#2563eb",
  },

  statGreen: {
    fontWeight: "700",
    color: "#16a34a",
  },

  participantCard: {
    backgroundColor: "#f9fafb",
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  name: {
    fontWeight: "700",
    marginBottom: 4,
  },

  badge: {
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    alignSelf: "flex-start",
  },

  badgeText: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 11,
  },
});

