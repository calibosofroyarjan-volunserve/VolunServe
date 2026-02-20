import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    where,
} from "firebase/firestore";
import React, { useState } from "react";
import {
    Alert,
    Dimensions,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../../lib/firebase";

const { width } = Dimensions.get("window");
const CARD_WIDTH = width - 40;

const formatDate = (v: any) => {
  try {
    const d = v?.toDate?.() ? v.toDate() : null;
    if (!d) return "-";
    return d.toLocaleString();
  } catch {
    return "-";
  }
};

const buildVerifyCode = (refNumber: string) => `VSJDM-${refNumber}`;

export default function VerifyReceipt() {
  const router = useRouter();

  const [refNumber, setRefNumber] = useState("");
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<any | null>(null); // donation data
  const [status, setStatus] = useState<"idle" | "valid" | "invalid">("idle");

  const verify = async () => {
    const ref = refNumber.trim();

    if (!/^\d{13}$/.test(ref)) {
      Alert.alert("Invalid", "Reference number must be exactly 13 digits.");
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus("idle");

    try {
      // ✅ Primary: if you used refNumber as doc ID (your current donation.tsx does this)
      const byId = await getDoc(doc(db, "donations", ref));
      if (byId.exists()) {
        const data = byId.data();
        setResult({ id: byId.id, ...data });
        setStatus("valid");
        return;
      }

      // ✅ Fallback: if older donations were saved with random doc IDs
      const q = query(
        collection(db, "donations"),
        where("refNumber", "==", ref),
        limit(1)
      );
      const snap = await getDocs(q);

      if (!snap.empty) {
        const d = snap.docs[0];
        setResult({ id: d.id, ...d.data() });
        setStatus("valid");
      } else {
        setStatus("invalid");
      }
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to verify. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.topRow}>
        <Text style={styles.title}>Verify Receipt</Text>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={{ color: "#fff", fontWeight: "800" }}>Back</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        Enter the GCash reference number to validate if a receipt is official and
        recorded in the system.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>GCash Reference Number</Text>
        <TextInput
          value={refNumber}
          onChangeText={setRefNumber}
          placeholder="Enter 13-digit reference number"
          keyboardType="numeric"
          style={styles.input}
        />

        <TouchableOpacity onPress={verify} disabled={loading}>
          <LinearGradient
            colors={["#0f766e", "#0ea5e9"]}
            style={styles.button}
          >
            <Text style={styles.buttonText}>
              {loading ? "Verifying..." : "Verify"}
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* RESULT */}
      {status === "valid" && result && (
        <View style={[styles.resultCard, styles.validCard]}>
          <Text style={styles.resultTitle}>✅ Valid Receipt</Text>

          <Text style={styles.small}>
            Verification Code:{" "}
            <Text style={styles.bold}>{buildVerifyCode(result.refNumber || refNumber)}</Text>
          </Text>

          <View style={styles.hr} />

          <Text style={styles.small}>
            Amount: <Text style={styles.bold}>PHP {Number(result.amount || 0).toFixed(2)}</Text>
          </Text>
          <Text style={styles.small}>
            Barangay: <Text style={styles.bold}>{result.barangay || "-"}</Text>
          </Text>
          <Text style={styles.small}>
            Status: <Text style={styles.bold}>{String(result.status || "-").toUpperCase()}</Text>
          </Text>
          <Text style={styles.small}>
            Submitted: <Text style={styles.bold}>{formatDate(result.createdAt)}</Text>
          </Text>

          {result.status === "rejected" && result.rejectedReason ? (
            <>
              <View style={styles.hr} />
              <Text style={styles.small}>
                Rejected Reason: <Text style={styles.bold}>{result.rejectedReason}</Text>
              </Text>
            </>
          ) : null}
        </View>
      )}

      {status === "invalid" && (
        <View style={[styles.resultCard, styles.invalidCard]}>
          <Text style={styles.resultTitle}>❌ Invalid Receipt</Text>
          <Text style={styles.small}>
            This reference number is not recorded in the system. If you believe
            this is an error, please contact the administrator.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f4f7fb", paddingBottom: 40 },

  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "900" },
  backBtn: { backgroundColor: "#111827", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12 },

  subtitle: { color: "#64748b", marginTop: 10, marginBottom: 14, fontWeight: "600" },

  card: { width: CARD_WIDTH, alignSelf: "center", backgroundColor: "#fff", padding: 16, borderRadius: 18, elevation: 2 },
  label: { fontSize: 12, color: "#64748b", fontWeight: "700" },
  input: { marginTop: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 14, padding: 12, fontSize: 16, backgroundColor: "#fff" },

  button: { marginTop: 12, height: 54, borderRadius: 16, justifyContent: "center", alignItems: "center" },
  buttonText: { color: "#fff", fontWeight: "900", fontSize: 16 },

  resultCard: { width: CARD_WIDTH, alignSelf: "center", marginTop: 14, padding: 16, borderRadius: 18, elevation: 2 },
  validCard: { backgroundColor: "#ecfdf5", borderWidth: 1, borderColor: "#a7f3d0" },
  invalidCard: { backgroundColor: "#fff1f2", borderWidth: 1, borderColor: "#fecdd3" },

  resultTitle: { fontSize: 16, fontWeight: "900", marginBottom: 8 },
  small: { color: "#0f172a", fontWeight: "600", marginTop: 4 },
  bold: { fontWeight: "900" },

  hr: { height: 1, backgroundColor: "#e2e8f0", marginVertical: 10 },
});
