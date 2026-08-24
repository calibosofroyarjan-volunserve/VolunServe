import { useLocalSearchParams, useRouter } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    Alert,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { db } from "../../lib/firebase";

export default function VerifyCertificate() {
  const router = useRouter();
  const { certId } = useLocalSearchParams();

  const [input, setInput] = useState("");
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (certId) {
      setInput(String(certId));
    }
  }, [certId]);

  const handleVerify = async () => {
    if (!input.trim()) {
      Alert.alert("Enter Certificate ID");
      return;
    }

    try {
      setError("");
      setResult(null);

      const q = query(
        collection(db, "certificates"),
        where("certificateId", "==", input.trim())
      );

      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        setError("❌ Invalid Certificate");
        return;
      }

      setResult(snapshot.docs[0].data());
    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Failed to verify certificate.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify Certificate</Text>

      <TextInput
        placeholder="Enter Certificate ID"
        value={input}
        onChangeText={setInput}
        style={styles.input}
      />

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={[styles.button, styles.buttonVerify]}
          onPress={handleVerify}
        >
          <Text style={styles.buttonText}>Verify</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.button, styles.buttonScan]}
          onPress={() => router.push("/scan" as any)}
        >
          <Text style={styles.buttonText}>📷 Scan QR</Text>
        </TouchableOpacity>
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result && (
        <View style={styles.card}>
          <Text style={styles.valid}>✅ VALID CERTIFICATE</Text>

          <Text style={styles.verifyNote}>
            Verified by VolunServe System
          </Text>

          <Text>Name: {result.name}</Text>
          <Text>Task: {result.task}</Text>
          <Text>
            Date:{" "}
            {result.date
              ? new Date(result.date).toLocaleDateString()
              : "-"}
          </Text>
          <Text>ID: {result.certificateId}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 20,
    flex: 1,
    backgroundColor: "#f1f5f9",
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 20,
  },
  input: {
    backgroundColor: "#fff",
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  button: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonVerify: {
    backgroundColor: "#0f766e",
    marginRight: 5,
  },
  buttonScan: {
    backgroundColor: "#7c3aed",
    marginLeft: 5,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "bold",
  },
  error: {
    color: "red",
    marginTop: 10,
    fontWeight: "bold",
  },
  card: {
    marginTop: 20,
    backgroundColor: "#fff",
    padding: 15,
    borderRadius: 10,
  },
  valid: {
    color: "green",
    fontWeight: "bold",
    marginBottom: 5,
  },
  verifyNote: {
    color: "#16a34a",
    fontWeight: "600",
    marginBottom: 10,
  },
});