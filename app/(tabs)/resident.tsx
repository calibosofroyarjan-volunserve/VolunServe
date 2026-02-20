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

type Category =
  | "disaster"
  | "medical"
  | "food"
  | "evacuation"
  | "other";

type Urgency = "low" | "medium" | "high" | "critical";

export default function Resident() {
  const user = auth.currentUser;

  const [profile, setProfile] = useState<any>(null);

  const [category, setCategory] = useState<Category>("disaster");
  const [urgency, setUrgency] = useState<Urgency>("medium");
  const [description, setDescription] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      const data = await getUserProfile(user.uid);
      setProfile(data);
      setAddress(data?.address || "");
      setPhone(data?.phone || "");
    };
    load();
  }, []);

  const handleSubmit = async () => {
    if (!description || !address || !phone) {
      Alert.alert("Incomplete", "Please fill all required fields.");
      return;
    }

    if (!user) {
      Alert.alert("Error", "User not authenticated.");
      return;
    }

    try {
      setLoading(true);

      await addDoc(collection(db, "assistanceRequests"), {
        residentUid: user.uid,
        fullName: profile?.fullName || "Resident",
        phone,
        barangay: profile?.barangay || profile?.address || "",
        address,
        category,
        urgencyLevel: urgency,
        description,
        status: "pending",
        createdAt: serverTimestamp(),
        reviewedBy: null,
        reviewedAt: null,
        rejectReason: null,
      });

      Alert.alert(
        "Submitted",
        "Your request has been submitted and is pending review."
      );

      setDescription("");
    } catch (err) {
      console.log(err);
      Alert.alert("Error", "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Request Community Assistance</Text>

      <Text style={styles.subtitle}>
        Submit your request for disaster or emergency assistance.
        Our admin team will review your case.
      </Text>

      {/* CATEGORY */}
      <Text style={styles.label}>Category</Text>
      <View style={styles.dropdownCard}>
        {(["disaster", "medical", "food", "evacuation", "other"] as Category[]).map(
          (item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.option,
                category === item && styles.selectedOption,
              ]}
              onPress={() => setCategory(item)}
            >
              <Text
                style={[
                  styles.optionText,
                  category === item && styles.selectedText,
                ]}
              >
                {item.toUpperCase()}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* URGENCY */}
      <Text style={styles.label}>Urgency Level</Text>
      <View style={styles.dropdownCard}>
        {(["low", "medium", "high", "critical"] as Urgency[]).map(
          (item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.option,
                urgency === item && styles.selectedUrgency,
              ]}
              onPress={() => setUrgency(item)}
            >
              <Text
                style={[
                  styles.optionText,
                  urgency === item && styles.selectedText,
                ]}
              >
                {item.toUpperCase()}
              </Text>
            </TouchableOpacity>
          )
        )}
      </View>

      {/* ADDRESS */}
      <Text style={styles.label}>Full Address</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="Enter complete address"
      />

      {/* PHONE */}
      <Text style={styles.label}>Contact Number</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="Enter contact number"
        keyboardType="phone-pad"
      />

      {/* DESCRIPTION */}
      <Text style={styles.label}>Describe the Situation</Text>
      <TextInput
        style={[styles.input, { height: 120 }]}
        value={description}
        onChangeText={setDescription}
        placeholder="Explain what assistance is needed..."
        multiline
      />

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmit}
        disabled={loading}
      >
        <Text style={styles.submitText}>
          {loading ? "Submitting..." : "Submit Request"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    backgroundColor: "#f4f7fb",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 8,
  },
  subtitle: {
    color: "#64748b",
    marginBottom: 20,
  },
  label: {
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  dropdownCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    overflow: "hidden",
  },
  option: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  selectedOption: {
    backgroundColor: "#e0f2fe",
  },
  selectedUrgency: {
    backgroundColor: "#fee2e2",
  },
  optionText: {
    fontWeight: "600",
  },
  selectedText: {
    color: "#1e40af",
  },
  submitButton: {
    backgroundColor: "#2563eb",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitText: {
    color: "#fff",
    fontWeight: "800",
  },
});
