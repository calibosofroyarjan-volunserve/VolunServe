import React, { useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

type Severity = "low" | "medium" | "high" | "critical";

export default function PublicResident() {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  const requireLogin = () => {
    Alert.alert(
      "Login Required",
      "Please login or create an account to submit a disaster case."
    );
  };

  const SeverityPill = ({ value }: { value: Severity }) => {
    const isActive = severity === value;
    return (
      <TouchableOpacity
        onPress={() => setSeverity(value)}
        style={[styles.pill, isActive && styles.pillActive]}
      >
        <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
          {value.toUpperCase()}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Report a Disaster Case</Text>
      <Text style={styles.subtitle}>
        Submit a structured report so the LGU can validate, prioritize, and assign help properly.
      </Text>

      <View style={styles.card}>
        <Text style={styles.label}>Case Title</Text>
        <TextInput
          style={styles.input}
          placeholder='Example: "Family trapped due to flooding"'
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.label}>Category</Text>
        <TextInput
          style={styles.input}
          placeholder='Example: Flood / Fire / Medical / Landslide'
          value={category}
          onChangeText={setCategory}
        />

        <Text style={styles.label}>Severity</Text>
        <View style={styles.pillRow}>
          <SeverityPill value="low" />
          <SeverityPill value="medium" />
          <SeverityPill value="high" />
          <SeverityPill value="critical" />
        </View>

        <Text style={styles.label}>Location (Barangay / Address)</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter location"
          value={location}
          onChangeText={setLocation}
        />

        <Text style={styles.label}>Contact Number</Text>
        <TextInput
          style={styles.input}
          placeholder="Enter contact number"
          value={contactNumber}
          onChangeText={setContactNumber}
          keyboardType="phone-pad"
        />

        <Text style={styles.label}>Details</Text>
        <TextInput
          style={[styles.input, { minHeight: 110, textAlignVertical: "top" }]}
          placeholder="Explain what happened, number of people affected, urgent needs, etc."
          value={details}
          onChangeText={setDetails}
          multiline
        />

        <TouchableOpacity
          style={styles.button}
          onPress={requireLogin}
        >
          <Text style={styles.buttonText}>Submit Case</Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Login required to submit and track disaster cases.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f4f7fb" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 6 },
  subtitle: {
    color: "#475569",
    fontWeight: "600",
    marginBottom: 14,
    lineHeight: 18,
  },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  label: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "800",
    marginTop: 10,
    marginBottom: 6,
  },

  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    fontWeight: "600",
    color: "#0f172a",
  },

  pillRow: { flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 4 },

  pill: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#f8fafc",
  },

  pillActive: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
  },

  pillText: { fontWeight: "900", color: "#0f172a", fontSize: 11 },
  pillTextActive: { color: "#fff" },

  button: {
    marginTop: 14,
    backgroundColor: "#2563eb",
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
  },

  buttonText: { color: "#fff", fontWeight: "900" },

  note: {
    marginTop: 10,
    color: "#64748b",
    fontWeight: "600",
    fontSize: 12,
    lineHeight: 16,
  },
});