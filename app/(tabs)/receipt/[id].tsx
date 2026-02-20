import { useLocalSearchParams } from "expo-router";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { db } from "../../../lib/firebase";

interface Donation {
  donorName: string;
  amount: number;
  barangay: string;
  refNumber: string;
  status: string;
  createdAt?: any;

  verifiedAt?: any;
  rejectedAt?: any;
  rejectedReason?: string;

  beneficiary?: string;
  familiesHelped?: number;
  distributionNote?: string;
  distributedAt?: any;
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

// 🔐 Verification Code Generator
const buildVerifyCode = (refNumber: string) => `VSJDM-${refNumber}`;

export default function Receipt() {
  const { id } = useLocalSearchParams();
  const [donation, setDonation] = useState<Donation | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!id) return;

      const snap = await getDoc(doc(db, "donations", String(id)));
      if (snap.exists()) {
        setDonation(snap.data() as Donation);
      }

      setLoading(false);
    };

    load();
  }, [id]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!donation) {
    return (
      <View style={styles.center}>
        <Text>Receipt not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Official Donation Receipt</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Amount</Text>
        <Text style={styles.value}>
          PHP {Number(donation.amount).toFixed(2)}
        </Text>

        <Text style={styles.label}>Barangay</Text>
        <Text style={styles.value}>{donation.barangay}</Text>

        <Text style={styles.label}>Reference Number</Text>
        <Text style={styles.value}>{donation.refNumber}</Text>

        {/* 🔥 ADDED VERIFICATION CODE */}
        <Text style={styles.label}>Verification Code</Text>
        <Text style={styles.verifyCode}>
          {buildVerifyCode(donation.refNumber)}
        </Text>

        <Text style={styles.verifyNote}>
          This receipt can be validated using the Verify Receipt feature.
        </Text>

        <Text style={styles.label}>Status</Text>
        <Text style={styles.status}>
          {donation.status?.toUpperCase()}
        </Text>

        <Text style={styles.label}>Submitted</Text>
        <Text style={styles.value}>
          {formatDate(donation.createdAt)}
        </Text>
      </View>

      {/* VERIFIED */}
      {donation.status === "received" && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Verification Details</Text>
          <Text style={styles.value}>
            Verified on: {formatDate(donation.verifiedAt)}
          </Text>
        </View>
      )}

      {/* REJECTED */}
      {donation.status === "rejected" && (
        <View style={[styles.card, styles.rejectCard]}>
          <Text style={styles.sectionTitle}>Rejection Details</Text>
          <Text style={styles.value}>
            Reason: {donation.rejectedReason || "-"}
          </Text>
          <Text style={styles.value}>
            Date: {formatDate(donation.rejectedAt)}
          </Text>
        </View>
      )}

      {/* DISTRIBUTED */}
      {donation.status === "distributed" && (
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Distribution Report</Text>

          <Text style={styles.value}>
            Beneficiary: {donation.beneficiary || "-"}
          </Text>

          <Text style={styles.value}>
            Families Helped: {donation.familiesHelped ?? "-"}
          </Text>

          {donation.distributionNote ? (
            <Text style={styles.value}>
              Note: {donation.distributionNote}
            </Text>
          ) : null}

          <Text style={styles.value}>
            Distributed on: {formatDate(donation.distributedAt)}
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

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
    fontSize: 24,
    fontWeight: "800",
    marginBottom: 20,
    textAlign: "center",
  },
  card: {
    backgroundColor: "#ffffff",
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    elevation: 2,
  },
  rejectCard: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
  },
  label: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 6,
  },
  value: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 6,
  },
  status: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 10,
  },

  // 🔥 Added styles
  verifyCode: {
    fontSize: 16,
    fontWeight: "900",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  verifyNote: {
    marginTop: 4,
    fontSize: 12,
    color: "#64748b",
    fontWeight: "600",
  },
});
