import { collection, getDocs, orderBy, query } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  FlatList,
  StyleSheet,
  Text,
  View
} from "react-native";
import { db } from "../../lib/firebase";

export default function Announcements() {

  const [data, setData] = useState<any[]>([]);

  const fetchAnnouncements = async () => {
    try {
      const q = query(
        collection(db, "announcements"),
        orderBy("createdAt", "desc")
      );

      const snapshot = await getDocs(q);

      const list = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setData(list);

    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  return (
    <View style={styles.container}>

      <Text style={styles.title}>
        Announcements
      </Text>

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            <Text style={styles.cardMessage}>{item.message}</Text>
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
    backgroundColor: "#fff"
  },

  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 15
  },

  card: {
    backgroundColor: "#f1f5f9",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 5
  },

  cardMessage: {
    fontSize: 14,
    color: "#334155"
  }
});
