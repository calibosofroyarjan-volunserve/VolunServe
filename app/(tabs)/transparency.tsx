import { liveUi as designUi } from "../../constants/volunserveLiveUi";
import {
    collection,
    onSnapshot,
    orderBy,
    query,
    where,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { db } from "../../lib/firebase";

interface Donation {
  id: string;
  amount: number;
  barangay: string;
  status: string;
  beneficiary?: string;
  familiesHelped?: number;
}

export default function Transparency() {
  const [distributed, setDistributed] = useState<Donation[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, "donations"),
      where("status", "==", "distributed"),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...(docSnap.data() as any),
      })) as Donation[];

      setDistributed(list);
    });

    return unsub;
  }, []);

  const totalDistributed = useMemo(() => {
    return distributed.reduce(
      (sum, d) => sum + Number(d.amount || 0),
      0
    );
  }, [distributed]);

  const totalFamilies = useMemo(() => {
    return distributed.reduce(
      (sum, d) => sum + Number(d.familiesHelped || 0),
      0
    );
  }, [distributed]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Public Transparency</Text>

      <View style={styles.card}>
        <Text>Total Distributed</Text>
        <Text style={styles.big}>
          PHP {totalDistributed.toFixed(2)}
        </Text>
      </View>

      <View style={styles.card}>
        <Text>Families Helped</Text>
        <Text style={styles.big}>{totalFamilies}</Text>
      </View>

      <Text style={styles.section}>Recent Distributions</Text>

      {distributed.map((d) => (
        <View key={d.id} style={styles.listCard}>
          <Text style={styles.amount}>
            PHP {Number(d.amount).toFixed(2)}
          </Text>
          <Text>Barangay: {d.barangay}</Text>
          <Text>Beneficiary: {d.beneficiary || "N/A"}</Text>
          <Text>Families helped: {d.familiesHelped || 0}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 26},
  title: { fontSize: designUi.type.page.fontSize, fontWeight: designUi.type.page.fontWeight, marginBottom: 20, lineHeight: designUi.type.page.lineHeight,},
  card: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 18,
    marginBottom: 15,
  
    borderWidth: 1,
    borderColor: "#DCE8DF"},
  big: { fontSize: 20, fontWeight: "bold", marginTop: 5 },
  section: { marginTop: 20, fontWeight: "bold" },
  listCard: {
    backgroundColor: "#ffffff",
    padding: 20,
    borderRadius: 17,
    marginBottom: 10,
  
    borderWidth: 1,
    borderColor: "#DCE8DF"},
  amount: { fontWeight: "bold", marginBottom: 5 },
});
