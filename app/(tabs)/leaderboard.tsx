import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    FlatList,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { db } from "../../lib/firebase";

type User = {
  name: string;
  points: number;
};

export default function Leaderboard() {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const q = query(collection(db, "users"), orderBy("points", "desc"));

    const unsub = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as User);
      setUsers(data);
    });

    return () => unsub();
  }, []);

  const getBadge = (points: number) => {
    if (points >= 20) return "🏆 Elite";
    if (points >= 10) return "🔥 Active";
    if (points >= 5) return "⭐ Contributor";
    return "👤 Beginner";
  };

  const getProgress = (points: number) => {
    if (points >= 20) return "MAX LEVEL";
    if (points >= 10) return `${20 - points} pts to Elite`;
    if (points >= 5) return `${10 - points} pts to Active`;
    return `${5 - points} pts to Contributor`;
  };

  const renderTop3 = () => {
    return users.slice(0, 3).map((user, index) => {
      const medals = ["🥇", "🥈", "🥉"];
      const colors = ["#facc15", "#e5e7eb", "#f97316"];

      return (
        <View key={index} style={[styles.topCard, { backgroundColor: colors[index] }]}>
          <Text style={styles.medal}>{medals[index]}</Text>
          <Text style={styles.topName}>{user.name}</Text>
          <Text style={styles.topPoints}>{user.points} pts</Text>
        </View>
      );
    });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🏆 Leaderboard</Text>

      {/* 🔥 TOP 3 PODIUM */}
      <View style={styles.topContainer}>
        {renderTop3()}
      </View>

      {/* 🔽 REST OF USERS */}
      <FlatList
        data={users.slice(3)}
        keyExtractor={(_, i) => i.toString()}
        renderItem={({ item, index }) => (
          <View style={styles.card}>
            <Text style={styles.rank}>#{index + 4}</Text>

            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.badge}>{getBadge(item.points)}</Text>
              <Text style={styles.progress}>{getProgress(item.points)}</Text>
            </View>

            <Text style={styles.points}>{item.points} pts</Text>
          </View>
        )}
      />
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
    fontSize: 26,
    fontWeight: "bold",
    marginBottom: 15,
  },

  // 🔥 TOP 3
  topContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 20,
  },

  topCard: {
    flex: 1,
    marginHorizontal: 5,
    padding: 15,
    borderRadius: 15,
    alignItems: "center",
  },

  medal: {
    fontSize: 28,
  },

  topName: {
    fontWeight: "bold",
    marginTop: 5,
  },

  topPoints: {
    marginTop: 3,
  },

  // 🔽 LIST
  card: {
    flexDirection: "row",
    padding: 15,
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 10,
    alignItems: "center",
  },

  rank: {
    width: 40,
    fontWeight: "bold",
    fontSize: 16,
  },

  name: {
    fontWeight: "bold",
    fontSize: 16,
  },

  badge: {
    fontSize: 12,
    color: "#555",
  },

  progress: {
    fontSize: 11,
    color: "#888",
  },

  points: {
    fontWeight: "bold",
  },
});