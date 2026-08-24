import { useLocalSearchParams } from "expo-router";
import { collection, onSnapshot, query } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import { db } from "../../lib/firebase";

type Participant = {
  uid?: string;
  userId?: string;
  name?: string;
  fullName?: string;
  points?: number;
  checkedInAt?: any;
  checkedOutAt?: any;
};

export default function EventLeaderboard() {
  const { eventId } = useLocalSearchParams();
  const [users, setUsers] = useState<Participant[]>([]);

  useEffect(() => {
    if (!eventId) return;

    const q = query(
      collection(db, "volunteerEvents", String(eventId), "participants")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => {
        const item = doc.data() as Participant;

        return {
          ...item,
          uid: item.uid || item.userId || doc.id,
          points: Number(item.points || 0),
        };
      });

      data.sort((a, b) => Number(b.points || 0) - Number(a.points || 0));

      setUsers(data);
    });

    return () => unsub();
  }, [eventId]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏆 Event Leaderboard</Text>

      {users.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>No volunteers yet</Text>
          <Text style={styles.emptyText}>
            Volunteers will appear here after they join this event.
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item, index) => item.uid || String(index)}
          renderItem={({ item, index }) => {
            const isTop1 = index === 0;
            const isTop2 = index === 1;
            const isTop3 = index === 2;

            return (
              <View
                style={[
                  styles.card,
                  isTop1 && styles.gold,
                  isTop2 && styles.silver,
                  isTop3 && styles.bronze,
                ]}
              >
                <Text style={styles.rank}>
                  {isTop1
                    ? "🥇"
                    : isTop2
                    ? "🥈"
                    : isTop3
                    ? "🥉"
                    : `#${index + 1}`}
                </Text>

                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>
                    {item.fullName || item.name || "Volunteer"}
                  </Text>

                  <Text style={styles.status}>
                    {item.checkedOutAt
                      ? "Completed"
                      : item.checkedInAt
                      ? "Checked-in"
                      : "Joined"}
                  </Text>

                  <Text style={styles.points}>{item.points || 0} pts</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: "#f1f5f9",
  },

  title: {
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 15,
  },

  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    backgroundColor: "#fff",
    elevation: 2,
  },

  gold: {
    backgroundColor: "#facc15",
  },

  silver: {
    backgroundColor: "#e5e7eb",
  },

  bronze: {
    backgroundColor: "#fdba74",
  },

  rank: {
    fontSize: 18,
    fontWeight: "bold",
    marginRight: 10,
    width: 40,
  },

  name: {
    fontSize: 16,
    fontWeight: "700",
    color: "#0f172a",
  },

  status: {
    fontSize: 12,
    color: "#475569",
    marginTop: 2,
  },

  points: {
    fontSize: 14,
    fontWeight: "bold",
    marginTop: 4,
    color: "#111827",
  },

  emptyCard: {
    backgroundColor: "#fff",
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },

  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },

  emptyText: {
    marginTop: 6,
    color: "#64748b",
    lineHeight: 18,
  },
});