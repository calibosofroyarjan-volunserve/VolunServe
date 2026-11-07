import { liveUi as designUi } from "../../constants/volunserveLiveUi";
import { useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { auth, db } from "../../lib/firebase";

interface Donation {
  id: string;
  amount: number;
  barangay: string;
  status: string;
  refNumber: string;
  beneficiary?: string;
  familiesHelped?: number;
  createdAt: any;
}

export default function DonationHistory() {
  const router = useRouter();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid);

        const q = query(
          collection(db, "donations"),
          where("donorUid", "==", user.uid),
          orderBy("createdAt", "desc")
        );

        const unsubSnap = onSnapshot(q, (snapshot) => {
          const list: Donation[] = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data(),
          })) as Donation[];

          setDonations(list);
        });

        return () => unsubSnap();
      }
    });

    return () => unsubAuth();
  }, []);

  const statusColor = (status: string) => {
    switch (status) {
      case "pending":
        return "#6b7280";
      case "received":
        return "#2563eb";
      case "distributed":
        return "#16a34a";
      case "rejected":
        return "#dc2626";
      default:
        return "#000";
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>My Donation History</Text>

      {donations.length === 0 && (
        <Text style={styles.empty}>No donations yet.</Text>
      )}

      {donations.map((d) => (
        <View key={d.id} style={styles.card}>
          <Text style={styles.amount}>PHP {d.amount?.toFixed(2)}</Text>
          <Text>Barangay: {d.barangay}</Text>
          <Text>Reference: {d.refNumber}</Text>

          <Text style={{ color: statusColor(d.status), fontWeight: "700", marginTop: 6 }}>
            Status: {d.status?.toUpperCase()}
          </Text>

          {d.status === "distributed" && (
            <View style={{ marginTop: 8 }}>
              <Text style={{ fontWeight: "600" }}>
                Distributed to: {d.beneficiary}
              </Text>
              <Text>Families helped: {d.familiesHelped}</Text>
            </View>
          )}

          {/* 🔥 ADDED BUTTON — NOTHING REMOVED */}
          <TouchableOpacity
            style={styles.receiptBtn}
            onPress={() =>
              router.push({
                pathname: "/(tabs)/receipt/[id]",
                params: { id: d.id },
              } as any)
            }
          >
            <Text style={styles.receiptText}>View Official Receipt</Text>
          </TouchableOpacity>

        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 26,
    backgroundColor: "#F5F8F6",
  },
  title: {
    fontSize: designUi.type.page.fontSize,
    fontWeight: designUi.type.page.fontWeight,
    marginBottom: 20, lineHeight: designUi.type.page.lineHeight,},
  empty: {
    color: "#6b7280",
  },
  card: {
    backgroundColor: "#FFFFFF",
    padding: 22,
    borderRadius: 18,
    marginBottom: 15,
  
    borderWidth: 1,
    borderColor: "#DCE8DF",
    shadowColor: "#153C2F",
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: {width:0,height:4},
    elevation: 1},
  amount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#16a34a",
  },

  // 🔥 NEW STYLE (only addition)
  receiptBtn: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  receiptText: {
    color: "#ffffff",
    fontWeight: "800",
  },
});

