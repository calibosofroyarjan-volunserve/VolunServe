import {
  addDoc,
  collection,
  serverTimestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { auth, db } from "../../lib/firebase";
import { getUserProfile } from "../../lib/firebaseAuth";

type Severity = "low" | "medium" | "high" | "critical";
type CaseStatus = "reported" | "validated" | "assigned" | "in_progress" | "resolved" | "closed";

export default function Resident() {
  const user = auth.currentUser;

  const [loadingProfile, setLoadingProfile] = useState(true);
  const [profile, setProfile] = useState<any>(null);

  // case fields
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [severity, setSeverity] = useState<Severity>("medium");
  const [location, setLocation] = useState("");
  const [details, setDetails] = useState("");
  const [contactNumber, setContactNumber] = useState("");

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        if (!user) return;
        const p = await getUserProfile(user.uid);
        setProfile(p);

        // auto-fill best guesses
        const brgy = p?.barangay || "";
        const addr = p?.address || "";
        if (!location) setLocation(brgy ? `Brgy. ${brgy}` : addr);

        // optional: if your profile has phone stored as "phone", this will fill it.
        if (!contactNumber) setContactNumber(p?.phone || "");
      } finally {
        setLoadingProfile(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validate = () => {
    if (!title.trim()) return "Please enter a case title.";
    if (!category.trim()) return "Please enter a category (e.g. Flood, Fire, Medical).";
    if (!location.trim()) return "Please enter the location (Barangay / address).";
    if (!details.trim()) return "Please enter details of the situation.";
    if (!contactNumber.trim()) return "Please enter your contact number.";
    if (contactNumber.trim().length < 8) return "Contact number looks too short.";
    return null;
  };

  const submitCase = async () => {
    const err = validate();
    if (err) {
      Alert.alert("Incomplete", err);
      return;
    }
    if (!user) {
      Alert.alert("Not logged in", "Please login again.");
      return;
    }

    try {
      setSubmitting(true);

      const payload = {
        // reporter
        reporterUid: user.uid,
        reporterName: profile?.fullName || "Resident",
        reporterEmail: profile?.email || "",
        reporterBarangay: profile?.barangay || "",
        contactNumber: contactNumber.trim(),

        // case info
        title: title.trim(),
        category: category.trim(),
        severity,
        status: "reported" as CaseStatus,
        location: location.trim(),
        details: details.trim(),

        // admin/workflow fields
        requiredVolunteers: 0,
        assignedVolunteersCount: 0,
        adminNote: "",
        validatedAt: null,
        assignedAt: null,
        resolvedAt: null,
        closedAt: null,

        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await addDoc(collection(db, "disasterCases"), payload);

      Alert.alert("Submitted", "Your disaster case has been submitted for validation.");

      // reset
      setTitle("");
      setCategory("");
      setSeverity("medium");
      setDetails("");
      // keep location + contact for convenience
    } catch (e) {
      console.log(e);
      Alert.alert("Error", "Failed to submit case. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const SeverityPill = ({ value }: { value: Severity }) => {
    const isActive = severity === value;
    return (
      <TouchableOpacity
        onPress={() => setSeverity(value)}
        style={[
          styles.pill,
          isActive && styles.pillActive,
        ]}
      >
        <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
          {value.toUpperCase()}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loadingProfile) {
    return (
      <View style={styles.center}>
        <Text>Loading...</Text>
      </View>
    );
  }

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
          style={[styles.button, submitting && styles.buttonDisabled]}
          onPress={submitCase}
          disabled={submitting}
        >
          <Text style={styles.buttonText}>
            {submitting ? "Submitting..." : "Submit Case"}
          </Text>
        </TouchableOpacity>

        <Text style={styles.note}>
          Cases are prioritized by severity and validated by admins before assignment.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, backgroundColor: "#f4f7fb" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 22, fontWeight: "900", marginBottom: 6 },
  subtitle: { color: "#475569", fontWeight: "600", marginBottom: 14, lineHeight: 18 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },

  label: { fontSize: 12, color: "#64748b", fontWeight: "800", marginTop: 10, marginBottom: 6 },
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
  buttonDisabled: { backgroundColor: "#93c5fd" },
  buttonText: { color: "#fff", fontWeight: "900" },

  note: { marginTop: 10, color: "#64748b", fontWeight: "600", fontSize: 12, lineHeight: 16 },
});